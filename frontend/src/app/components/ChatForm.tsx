"use client";

import React, { useState } from 'react';
import styles from './ChatForm.module.css';

interface ChatFormProps {
  onResponse: (response: string) => void;
}

const defaultModel = 'gpt-4.1-mini';

// Helper to get the correct API URL for dev/prod
const getApiUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8000/api/chat';
  }
  return '/api/chat';
};

const ChatForm: React.FC<ChatFormProps> = ({ onResponse }) => {
  const [developerMessage, setDeveloperMessage] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [model, setModel] = useState(defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    onResponse('');
    try {
      const response = await fetch(getApiUrl(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          developer_message: developerMessage,
          user_message: userMessage,
          model,
          api_key: apiKey,
        }),
      });
      if (!response.body) throw new Error('No response body');
      const reader = response.body.getReader();
      let result = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += new TextDecoder().decode(value);
        onResponse(result);
      }
      setLoading(false);
    } catch (err: any) {
      setError(err.message || 'Unknown error');
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.chatFormCard}>
      <label className={styles.formLabel}>
        Developer Message
        <textarea value={developerMessage} onChange={e => setDeveloperMessage(e.target.value)} required rows={2} className={styles.textarea} />
      </label>
      <label className={styles.formLabel}>
        User Message
        <textarea value={userMessage} onChange={e => setUserMessage(e.target.value)} required rows={2} className={styles.textarea} />
      </label>
      <label className={styles.formLabel}>
        Model
        <input value={model} onChange={e => setModel(e.target.value)} placeholder={defaultModel} className={styles.input} />
      </label>
      <label className={styles.formLabel}>
        OpenAI API Key
        <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" required className={styles.input} />
      </label>
      <button type="submit" disabled={loading} className={styles.button}>
        {loading ? 'Sending...' : 'Send'}
      </button>
      {error && <div className={styles.error}>{error}</div>}
    </form>
  );
};

export default ChatForm; 