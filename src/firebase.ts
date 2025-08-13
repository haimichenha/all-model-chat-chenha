import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// 1. Firebase configuration from Firebase console
const firebaseConfig = {
  apiKey: "AIzaSyA2ymCjgN4k5TYNxVASQSXfShQzx5qDKPE",
  authDomain: "certain-density-460902-s7.firebaseapp.com",
  projectId: "certain-density-460902-s7",
  storageBucket: "certain-density-460902-s7.firebasestorage.app",
  messagingSenderId: "848067839203",
  appId: "1:848067839203:web:c067993dbfbb1c2fc6b1d6"
};

// 2. Initialize Firebase app
const app = initializeApp(firebaseConfig);

// 3. Export Firebase services needed in the app
export const auth = getAuth(app);
export const db = getFirestore(app);

// 4. Simple function to handle user login
// It will try to sign in and return a Promise with user ID
export const getUserId = (): Promise<string | null> => {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is signed in (anonymous or otherwise)
        resolve(user.uid);
      } else {
        // User is not signed in, try anonymous sign in
        signInAnonymously(auth).then((userCredential) => {
          resolve(userCredential.user.uid);
        }).catch(() => {
          resolve(null); // If anonymous sign in fails
        });
      }
    });
  });
};