import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
// ðŸš¨ å¼•å…¥å…¨æ–°çš„è®°å¿†æ¨¡å—
// @ts-ignore
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyDa6ssBen7wtWMzTrYtIJy9fohmqjSXDtE",
  authDomain: "smart-budget-fyp.firebaseapp.com",
  projectId: "smart-budget-fyp",
  storageBucket: "smart-budget-fyp.firebasestorage.app",
  messagingSenderId: "508882088939",
  appId: "1:508882088939:web:382de1b0860556f915dfae"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
// 🚨 使用带有持久化记忆的 auth 初始化方式
export const auth =
  typeof getReactNativePersistence === "function"
    ? initializeAuth(app, {
        persistence: getReactNativePersistence(ReactNativeAsyncStorage),
      })
    : getAuth(app);
