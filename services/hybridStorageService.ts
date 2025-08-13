import { doc, setDoc, getDoc, deleteDoc, collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { db, getUserId } from '../src/firebase';
import { SavedChatSession, PersistentStore } from '../types';
import { logService } from './logService';

export interface StorageQuotaInfo {
  used: number;
  total: number;
  remaining: number;
  isNearLimit: boolean;
  canUseLocalStorage: boolean;
}

class HybridStorageService {
  private readonly STORAGE_WARNING_THRESHOLD = 0.85; // 85% full warning
  private readonly LOCAL_STORAGE_TEST_KEY = '__storage_test__';

  constructor() {
    // Initialize and test storage
    this.checkStorageHealth();
  }

  /**
   * 检测localStorage的健康状态
   */
  async checkStorageHealth(): Promise<StorageQuotaInfo> {
    try {
      // 尝试获取存储配额信息（如果支持）
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const total = estimate.quota || 5 * 1024 * 1024; // 默认5MB
        const remaining = total - used;
        const isNearLimit = used / total > this.STORAGE_WARNING_THRESHOLD;

        return {
          used,
          total,
          remaining,
          isNearLimit,
          canUseLocalStorage: this.testLocalStorage()
        };
      }
    } catch (error) {
      logService.warn('Unable to get storage estimate:', error);
    }

    // 如果无法获取准确信息，返回基础检测结果
    return {
      used: 0,
      total: 5 * 1024 * 1024, // 假设5MB
      remaining: 5 * 1024 * 1024,
      isNearLimit: false,
      canUseLocalStorage: this.testLocalStorage()
    };
  }

  /**
   * 测试localStorage是否可用
   */
  private testLocalStorage(): boolean {
    try {
      localStorage.setItem(this.LOCAL_STORAGE_TEST_KEY, 'test');
      localStorage.removeItem(this.LOCAL_STORAGE_TEST_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 智能存储：优先使用localStorage，满了则使用Firebase
   */
  async smartSave(key: string, data: any): Promise<boolean> {
    // 首先尝试localStorage
    try {
      const serializedData = JSON.stringify(data);
      localStorage.setItem(key, serializedData);
      logService.info(`Successfully saved to localStorage: ${key}`);
      return true;
    } catch (error: any) {
      if (error.name === 'QuotaExceededError' || 
          (error.message && error.message.toLowerCase().includes('quota'))) {
        logService.warn('localStorage quota exceeded, attempting Firebase backup...');
        
        // 使用Firebase作为后备
        return await this.saveToFirebase(key, data);
      } else {
        logService.error('Unexpected localStorage error:', error);
        return false;
      }
    }
  }

  /**
   * 智能加载：从localStorage和Firebase中加载数据
   */
  async smartLoad(key: string): Promise<any | null> {
    // 首先尝试从localStorage加载
    try {
      const localData = localStorage.getItem(key);
      if (localData) {
        const parsed = JSON.parse(localData);
        logService.info(`Successfully loaded from localStorage: ${key}`);
        return parsed;
      }
    } catch (error) {
      logService.warn('Error loading from localStorage:', error);
    }

    // 如果localStorage没有数据或出错，尝试从Firebase加载
    return await this.loadFromFirebase(key);
  }

  /**
   * 保存数据到Firebase
   */
  private async saveToFirebase(key: string, data: any): Promise<boolean> {
    try {
      const userId = await getUserId();
      if (!userId) {
        logService.error('Cannot save to Firebase: user not authenticated');
        return false;
      }

      const docRef = doc(db, 'userStorage', userId, 'data', key);
      await setDoc(docRef, {
        data: data,
        updatedAt: new Date(),
        key: key
      });

      logService.info(`Successfully saved to Firebase: ${key}`);
      return true;
    } catch (error) {
      logService.error('Error saving to Firebase:', error);
      return false;
    }
  }

  /**
   * 从Firebase加载数据
   */
  private async loadFromFirebase(key: string): Promise<any | null> {
    try {
      const userId = await getUserId();
      if (!userId) {
        logService.warn('Cannot load from Firebase: user not authenticated');
        return null;
      }

      const docRef = doc(db, 'userStorage', userId, 'data', key);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const firebaseData = docSnap.data();
        logService.info(`Successfully loaded from Firebase: ${key}`);
        return firebaseData.data;
      } else {
        logService.info(`No data found in Firebase for key: ${key}`);
        return null;
      }
    } catch (error) {
      logService.error('Error loading from Firebase:', error);
      return null;
    }
  }

  /**
   * 导出所有数据（包括localStorage和Firebase数据）
   */
  async exportAllData(): Promise<{ localStorage: any, firebase: any } | null> {
    try {
      const localStorageData: any = {};
      const firebaseData: any = {};

      // 导出localStorage数据
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('all-model-chat')) {
          try {
            localStorageData[key] = JSON.parse(localStorage.getItem(key) || '');
          } catch (e) {
            localStorageData[key] = localStorage.getItem(key);
          }
        }
      }

      // 导出Firebase数据
      const userId = await getUserId();
      if (userId) {
        const storageCollection = collection(db, 'userStorage', userId, 'data');
        const snapshot = await getDocs(storageCollection);
        
        snapshot.forEach((doc) => {
          const data = doc.data();
          firebaseData[data.key] = data.data;
        });
      }

      return { localStorage: localStorageData, firebase: firebaseData };
    } catch (error) {
      logService.error('Error exporting all data:', error);
      return null;
    }
  }

  /**
   * 清理旧的Firebase数据
   */
  async cleanupFirebaseData(daysOld: number = 30): Promise<number> {
    try {
      const userId = await getUserId();
      if (!userId) return 0;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const storageCollection = collection(db, 'userStorage', userId, 'data');
      const oldDataQuery = query(
        storageCollection,
        where('updatedAt', '<', cutoffDate),
        orderBy('updatedAt'),
        limit(50) // 批量删除，避免超时
      );

      const snapshot = await getDocs(oldDataQuery);
      let deletedCount = 0;

      for (const docSnapshot of snapshot.docs) {
        await deleteDoc(docSnapshot.ref);
        deletedCount++;
      }

      logService.info(`Cleaned up ${deletedCount} old Firebase documents`);
      return deletedCount;
    } catch (error) {
      logService.error('Error cleaning up Firebase data:', error);
      return 0;
    }
  }

  /**
   * 获取存储使用情况
   */
  async getStorageUsage(): Promise<{ localStorage: string, firebase: string }> {
    let localStorageSize = 0;
    let firebaseSize = 0;

    // 计算localStorage使用量
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('all-model-chat')) {
        const value = localStorage.getItem(key) || '';
        localStorageSize += key.length + value.length;
      }
    }

    // 计算Firebase使用量（估算）
    try {
      const userId = await getUserId();
      if (userId) {
        const storageCollection = collection(db, 'userStorage', userId, 'data');
        const snapshot = await getDocs(storageCollection);
        
        snapshot.forEach((doc) => {
          const data = JSON.stringify(doc.data());
          firebaseSize += data.length;
        });
      }
    } catch (error) {
      logService.warn('Error calculating Firebase usage:', error);
    }

    return {
      localStorage: this.formatBytes(localStorageSize),
      firebase: this.formatBytes(firebaseSize)
    };
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const hybridStorageService = new HybridStorageService();