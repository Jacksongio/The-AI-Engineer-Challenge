"use client";
import ChatForm from "./components/ChatForm";
import { useState } from "react";
import styles from "./page.module.css";
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const [response, setResponse] = useState("");
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>PDF Analyzer</h1>
      <div className={styles.flexRow}>
        <ChatForm onResponse={setResponse} />
        <div className={styles.responseBox}>
          {response ? (
            <ReactMarkdown>{response}</ReactMarkdown>
          ) : (
            <span className={styles.responsePlaceholder}>Response will appear here...</span>
          )}
        </div>
      </div>
    </div>
  );
}
