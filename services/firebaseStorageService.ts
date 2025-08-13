import { doc, setDoc, getDoc, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { db, getUserId } from '../src/firebase';
import { logService } from './logService';
import { SavedChatSession, ChatMessage, PersistentStore } from '../types';

interface FirebaseStorageData {
  sessions: SavedChatSession[];
  persistentStore: PersistentStore;
  lastUpdated: number;
}

class FirebaseStorageService {
  private userId: string | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initializeAuth();
  }

  private async initializeAuth(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        this.userId = await getUserId();
        if (this.userId) {
          logService.info('Firebase Storage Service initialized with user ID:', this.userId);
        } else {
          logService.warn('Firebase Storage Service: Failed to get user ID, Firebase storage disabled');
        }
      } catch (error) {
        logService.error('Firebase Storage Service: Initialization failed:', error);
      }
    })();

    return this.initPromise;
  }

  private async ensureInitialized(): Promise<boolean> {
    await this.initializeAuth();
    return !!this.userId;
  }

  /**
   * 备份数据到 Firebase (作为后备存储)
   */
  async backupToFirebase(sessions: SavedChatSession[], persistentStore: PersistentStore): Promise<boolean> {
    if (!(await this.ensureInitialized())) {
      return false;
    }

    try {
      const data: FirebaseStorageData = {
        sessions,
        persistentStore,
        lastUpdated: Date.now()
      };

      await setDoc(doc(db, 'userStorage', this.userId!), data);
      logService.info('Data successfully backed up to Firebase');
      return true;
    } catch (error) {
      logService.error('Failed to backup data to Firebase:', error);
      return false;
    }
  }

  /**
   * 从 Firebase 恢复数据
   */
  async restoreFromFirebase(): Promise<{ sessions: SavedChatSession[]; persistentStore: PersistentStore } | null> {
    if (!(await this.ensureInitialized())) {
      return null;
    }

    try {
      const docRef = doc(db, 'userStorage', this.userId!);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data() as FirebaseStorageData;
        logService.info('Data successfully restored from Firebase');
        return {
          sessions: data.sessions || [],
          persistentStore: data.persistentStore
        };
      } else {
        logService.info('No data found in Firebase storage');
        return null;
      }
    } catch (error) {
      logService.error('Failed to restore data from Firebase:', error);
      return null;
    }
  }

  /**
   * 检查 Firebase 中是否有备份数据
   */
  async hasFirebaseBackup(): Promise<boolean> {
    if (!(await this.ensureInitialized())) {
      return false;
    }

    try {
      const docRef = doc(db, 'userStorage', this.userId!);
      const docSnap = await getDoc(docRef);
      return docSnap.exists();
    } catch (error) {
      logService.error('Failed to check Firebase backup:', error);
      return false;
    }
  }

  /**
   * 获取 Firebase 备份的最后更新时间
   */
  async getFirebaseBackupTimestamp(): Promise<number | null> {
    if (!(await this.ensureInitialized())) {
      return null;
    }

    try {
      const docRef = doc(db, 'userStorage', this.userId!);
      const docSnap = await getDoc(docRef);
      
      if (docSnap.exists()) {
        const data = docSnap.data() as FirebaseStorageData;
        return data.lastUpdated || null;
      }
      return null;
    } catch (error) {
      logService.error('Failed to get Firebase backup timestamp:', error);
      return null;
    }
  }

  /**
   * 清除 Firebase 中的备份数据
   */
  async clearFirebaseStorage(): Promise<boolean> {
    if (!(await this.ensureInitialized())) {
      return false;
    }

    try {
      await deleteDoc(doc(db, 'userStorage', this.userId!));
      logService.info('Firebase storage cleared successfully');
      return true;
    } catch (error) {
      logService.error('Failed to clear Firebase storage:', error);
      return false;
    }
  }

  /**
   * 检查是否可以使用 Firebase 存储
   */
  async isFirebaseAvailable(): Promise<boolean> {
    return await this.ensureInitialized();
  }
}

export const firebaseStorageService = new FirebaseStorageService();