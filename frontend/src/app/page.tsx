"use client";
import ChatForm from "./components/ChatForm";
import { useState } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [response, setResponse] = useState("");
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>OpenAI Chat Playground</h1>
      <ChatForm onResponse={setResponse} />
      <div className={styles.responseBox}>
        {response ? response : <span className={styles.responsePlaceholder}>Response will appear here...</span>}
      </div>
    </div>
  );
}
