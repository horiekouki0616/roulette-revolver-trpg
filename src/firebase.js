// JavaScript source code
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDJO_o_LmZ5TDSeYvJTAAB522kpStwcGXQ",
  authDomain: "roulette-revolver-trpg.firebaseapp.com",
  projectId: "roulette-revolver-trpg",
  storageBucket: "roulette-revolver-trpg.firebasestorage.app",
  messagingSenderId: "645717258042",
  appId: "1:645717258042:web:2c7da2fcc62af9cdbaea03",
  measurementId: "G-5YL3T1CF27"
};

// 初期化
const app = initializeApp(firebaseConfig);

// データベース(Firestore)を使えるようにしてエクスポート
export const db = getFirestore(app);