// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBiozkLSXDcyFia2V_C9APIex1juIkh7aA",
  authDomain: "torredeoracao-aa401.firebaseapp.com",
  projectId: "torredeoracao-aa401",
  storageBucket: "torredeoracao-aa401.firebasestorage.app",
  messagingSenderId: "940785041822",
  appId: "1:940785041822:web:2a3909eef5490d503f168f"
};


// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

export { app, db };
