import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import firebaseConfig from "./firebase-config.js";

const REQUIRED_CONFIG_VALUES = [
  "apiKey",
  "authDomain",
  "projectId",
  "storageBucket",
  "messagingSenderId",
  "appId"
];

export const firebaseConfigured = REQUIRED_CONFIG_VALUES.every((key) => {
  const value = firebaseConfig[key];
  return typeof value === "string" && value.length > 0 && !value.startsWith("SUA_") && !value.startsWith("SEU_");
});

let auth = null;
let db = null;

if (firebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export {
  addDoc,
  auth,
  collection,
  createUserWithEmailAndPassword,
  deleteDoc,
  db,
  doc,
  getDoc,
  getDocs,
  isSignInWithEmailLink,
  onAuthStateChanged,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  sendSignInLinkToEmail,
  setDoc,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signOut,
  updateDoc,
  updateProfile,
  writeBatch
};