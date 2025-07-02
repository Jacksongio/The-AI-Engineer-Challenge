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

const getUploadApiUrl = () => {
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return 'http://localhost:8000/api/upload_pdf';
  }
  return '/api/upload_pdf';
};

const ChatForm: React.FC<ChatFormProps> = ({ onResponse }) => {
  const [developerMessage, setDeveloperMessage] = useState('');
  const [userMessage, setUserMessage] = useState('');
  const [model, setModel] = useState(defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0]);
      setUploadStatus(null);
    }
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) return;
    setUploadStatus('Uploading...');
    setError(null);
    const formData = new FormData();
    formData.append('file', pdfFile);
    try {
      const response = await fetch(getUploadApiUrl(), {
        method: 'POST',
        body: formData,
      });
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        setError('Server returned a non-JSON response: ' + text.slice(0, 200));
        setUploadStatus(null);
        return;
      }
      if (!response.ok) {
        throw new Error(data.detail || 'Upload failed');
      }
      setUploadStatus('Upload successful!');
    } catch (err: any) {
      setError(err.message || 'PDF upload error');
      setUploadStatus(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    onResponse('');
    if (pdfFile && uploadStatus !== 'Upload successful!') {
      await handlePdfUpload();
      if (uploadStatus !== 'Upload successful!') {
        setLoading(false);
        return;
      }
    }
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
      {/* PDF Upload */}
      <label className={styles.formLabel}>
        Upload PDF
        <input type="file" accept="application/pdf" onChange={handlePdfChange} className={styles.input} />
      </label>
      {uploadStatus && <div>{uploadStatus}</div>}
      {/* Existing fields */}
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