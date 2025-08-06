import { doc, setDoc, getDoc, collection, query, getDocs, deleteDoc } from "firebase/firestore";
import { db, getUserId } from '../firebase';
import { PersistentStore, ChatMessage, ChatSession, AppSettings } from '../types';
import { logService } from './logService';

// Storage size limits (in bytes, approximated)
const LOCAL_STORAGE_LIMIT = 5 * 1024 * 1024; // 5MB for Cloudflare
const WARNING_THRESHOLD = 0.8; // Warn when 80% full

interface StorageQuotaInfo {
  used: number;
  limit: number;
  percentage: number;
  isNearLimit: boolean;
  isOverLimit: boolean;
}

export class FirebaseStorageService {
  private isFirebaseAvailable = false;
  private userId: string | null = null;

  constructor() {
    this.initializeFirebase();
  }

  private async initializeFirebase() {
    try {
      this.userId = await getUserId();
      this.isFirebaseAvailable = !!this.userId;
      if (this.isFirebaseAvailable) {
        logService.info('Firebase storage initialized successfully');
      } else {
        logService.warn('Firebase storage unavailable, falling back to localStorage');
      }
    } catch (error) {
      logService.error('Failed to initialize Firebase storage:', error);
      this.isFirebaseAvailable = false;
    }
  }

  // Check localStorage usage and limits
  getStorageQuota(): StorageQuotaInfo {
    try {
      let used = 0;
      for (const key in localStorage) {
        if (localStorage.hasOwnProperty(key)) {
          used += (localStorage[key].length + key.length) * 2; // UTF-16 encoding
        }
      }

      const percentage = (used / LOCAL_STORAGE_LIMIT) * 100;
      
      return {
        used,
        limit: LOCAL_STORAGE_LIMIT,
        percentage,
        isNearLimit: percentage >= WARNING_THRESHOLD * 100,
        isOverLimit: percentage >= 100
      };
    } catch (error) {
      logService.error('Failed to calculate storage quota:', error);
      return {
        used: 0,
        limit: LOCAL_STORAGE_LIMIT,
        percentage: 0,
        isNearLimit: false,
        isOverLimit: false
      };
    }
  }

  // Check if storage is full or near full
  isStorageFull(): boolean {
    const quota = this.getStorageQuota();
    return quota.isOverLimit || quota.isNearLimit;
  }

  // Try to save data to localStorage, fallback to Firebase if full
  async saveData(key: string, data: any): Promise<{success: boolean, usedFirebase: boolean, error?: string}> {
    try {
      // Try localStorage first
      const serialized = JSON.stringify(data);
      const quotaBefore = this.getStorageQuota();
      
      if (!quotaBefore.isOverLimit) {
        try {
          localStorage.setItem(key, serialized);
          const quotaAfter = this.getStorageQuota();
          
          if (!quotaAfter.isOverLimit) {
            return { success: true, usedFirebase: false };
          } else {
            // localStorage became full after this operation, remove the item
            localStorage.removeItem(key);
          }
        } catch (error) {
          // localStorage.setItem failed, probably due to quota exceeded
          logService.warn('localStorage full, attempting Firebase fallback');
        }
      }

      // Fallback to Firebase if localStorage is full or failed
      if (this.isFirebaseAvailable && this.userId) {
        await this.saveToFirebase(key, data);
        return { success: true, usedFirebase: true };
      } else {
        return { 
          success: false, 
          usedFirebase: false, 
          error: 'Both localStorage and Firebase storage unavailable' 
        };
      }
    } catch (error) {
      logService.error('Failed to save data:', error);
      return { success: false, usedFirebase: false, error: error.message };
    }
  }

  // Load data from localStorage or Firebase
  async loadData(key: string): Promise<any> {
    try {
      // Try localStorage first
      const localData = localStorage.getItem(key);
      if (localData) {
        return JSON.parse(localData);
      }

      // Try Firebase if not in localStorage
      if (this.isFirebaseAvailable && this.userId) {
        return await this.loadFromFirebase(key);
      }

      return null;
    } catch (error) {
      logService.error('Failed to load data:', error);
      return null;
    }
  }

  // Save to Firebase Firestore
  private async saveToFirebase(key: string, data: any): Promise<void> {
    if (!this.userId) throw new Error('Firebase user not initialized');
    
    const docRef = doc(db, 'userdata', this.userId, 'storage', key);
    await setDoc(docRef, {
      data: data,
      timestamp: new Date(),
      key: key
    });
    logService.info(`Data saved to Firebase: ${key}`);
  }

  // Load from Firebase Firestore
  private async loadFromFirebase(key: string): Promise<any> {
    if (!this.userId) throw new Error('Firebase user not initialized');
    
    const docRef = doc(db, 'userdata', this.userId, 'storage', key);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      const docData = docSnap.data();
      logService.info(`Data loaded from Firebase: ${key}`);
      return docData.data;
    }
    
    return null;
  }

  // Migrate data from localStorage to Firebase
  async migrateToFirebase(): Promise<{success: boolean, migratedKeys: string[], errors: string[]}> {
    if (!this.isFirebaseAvailable || !this.userId) {
      return { success: false, migratedKeys: [], errors: ['Firebase not available'] };
    }

    const migratedKeys: string[] = [];
    const errors: string[] = [];

    try {
      // Get all localStorage keys
      const keys = Object.keys(localStorage);
      
      for (const key of keys) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            await this.saveToFirebase(key, parsed);
            migratedKeys.push(key);
          }
        } catch (error) {
          errors.push(`Failed to migrate ${key}: ${error.message}`);
          logService.error(`Migration error for ${key}:`, error);
        }
      }

      logService.info(`Migration completed. Migrated: ${migratedKeys.length}, Errors: ${errors.length}`);
      return { success: errors.length === 0, migratedKeys, errors };
    } catch (error) {
      logService.error('Migration failed:', error);
      return { success: false, migratedKeys, errors: [error.message] };
    }
  }

  // Sync data between localStorage and Firebase
  async syncWithFirebase(): Promise<void> {
    if (!this.isFirebaseAvailable || !this.userId) {
      return;
    }

    try {
      // Get all data from Firebase
      const storageCollection = collection(db, 'userdata', this.userId, 'storage');
      const querySnapshot = await getDocs(query(storageCollection));
      
      querySnapshot.forEach((doc) => {
        const docData = doc.data();
        const key = docData.key;
        
        try {
          // Try to save to localStorage if not over quota
          const quota = this.getStorageQuota();
          if (!quota.isOverLimit) {
            localStorage.setItem(key, JSON.stringify(docData.data));
          }
        } catch (error) {
          // localStorage might be full, that's okay
          logService.warn(`Could not sync ${key} to localStorage:`, error);
        }
      });
      
      logService.info('Sync with Firebase completed');
    } catch (error) {
      logService.error('Failed to sync with Firebase:', error);
    }
  }

  // Clear data from both localStorage and Firebase
  async clearAll(): Promise<void> {
    try {
      // Clear localStorage
      localStorage.clear();
      
      // Clear Firebase if available
      if (this.isFirebaseAvailable && this.userId) {
        const storageCollection = collection(db, 'userdata', this.userId, 'storage');
        const querySnapshot = await getDocs(query(storageCollection));
        
        const deletePromises = querySnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        
        logService.info('Cleared data from both localStorage and Firebase');
      } else {
        logService.info('Cleared data from localStorage');
      }
    } catch (error) {
      logService.error('Failed to clear storage:', error);
    }
  }

  // Get Firebase availability status
  getFirebaseStatus(): { available: boolean, userId: string | null } {
    return {
      available: this.isFirebaseAvailable,
      userId: this.userId
    };
  }

  // Force re-initialization of Firebase
  async reinitializeFirebase(): Promise<void> {
    await this.initializeFirebase();
  }
}

export const firebaseStorageService = new FirebaseStorageService();