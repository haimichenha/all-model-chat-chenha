import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// 1. 将您之前从 Firebase 控制台复制的配置粘贴到这里
const firebaseConfig = {
  apiKey: "AIzaSyA2ymCjgN4k5TYNxVASQSXfShQzx5qDKPE",
  authDomain: "certain-density-460902-s7.firebaseapp.com",
  projectId: "certain-density-460902-s7",
  storageBucket: "certain-density-460902-s7.firebasestorage.app",
  messagingSenderId: "848067839203",
  appId: "1:848067839203:web:c067993dbfbb1c2fc6b1d6"
};

// 2. 初始化 Firebase 应用
const app = initializeApp(firebaseConfig);

// 3. 导出我们需要在应用中使用的 Firebase 服务
export const auth = getAuth(app);
export const db = getFirestore(app);

// 4. 设置一个简单的函数来处理用户登录
// 它会尝试匿名登录，并返回一个包含用户ID的 Promise
export const getUserId = (): Promise<string | null> => {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // 用户已登录 (无论是匿名还是其他方式)
        resolve(user.uid);
      } else {
        // 用户未登录, 尝试匿名登录
        signInAnonymously(auth).then((userCredential) => {
          resolve(userCredential.user.uid);
        }).catch(() => {
          resolve(null); // 如果匿名登录失败
        });
      }
    });
  });
};