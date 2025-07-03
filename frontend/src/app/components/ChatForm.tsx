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

// Add a simple bar chart and word cloud component
const BarChart: React.FC<{ data: { word: string; count: number }[] }> = ({ data }) => (
  <div style={{ width: '100%', maxWidth: 400, margin: '16px 0' }}>
    <h4>Top Words (Bar Chart)</h4>
    <div style={{ display: 'flex', alignItems: 'flex-end', height: 120, gap: 4 }}>
      {data.slice(0, 5).map(({ word, count }) => (
        <div key={word} style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ background: '#4e79a7', height: count * 6, minHeight: 2, width: '100%' }} />
          <div style={{ fontSize: 10 }}>{word}</div>
          <div style={{ fontSize: 10 }}>{count}</div>
        </div>
      ))}
    </div>
  </div>
);

const WordCloud: React.FC<{ data: { word: string; count: number }[] }> = ({ data }) => (
  <div style={{ width: '100%', maxWidth: 400, margin: '16px 0' }}>
    <h4>Word Cloud</h4>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {data.map(({ word, count }) => (
        <span
          key={word}
          style={{
            fontSize: 12 + count * 2,
            opacity: 0.7 + Math.min(count / 20, 0.3),
            fontWeight: 600,
            color: '#4e79a7',
          }}
        >
          {word}
        </span>
      ))}
    </div>
  </div>
);

const ChatForm: React.FC<ChatFormProps> = ({ onResponse }) => {
  const [userMessage, setUserMessage] = useState('');
  const [model, setModel] = useState(defaultModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<{ word: string; count: number }[] | null>(null);
  const [uploadedFilenames, setUploadedFilenames] = useState<string[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string>('');
  const developerMessage = 'You are a pdf reader';

  const modelOptions = [
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    // Add more models here as needed
  ];

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
      } catch {
        setError('Server returned a non-JSON response: ' + text.slice(0, 200));
        setUploadStatus(null);
        setAnalytics(null);
        return;
      }
      if (!response.ok) {
        throw new Error(data.detail || 'Upload failed');
      }
      setUploadStatus('Upload successful!');
      setAnalytics(data.analytics || null);
      if (data.uploaded_filenames) {
        setUploadedFilenames(data.uploaded_filenames);
        setSelectedFilename(data.filename);
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'PDF upload error');
      } else {
        setError('PDF upload error');
      }
      setUploadStatus(null);
      setAnalytics(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    onResponse('');
    if (pdfFile && uploadStatus !== 'Upload successful!') {
      setError('Please upload the PDF before sending your message.');
      setLoading(false);
      return;
    }
    if (!selectedFilename) {
      setError('Please select a PDF to chat with.');
      setLoading(false);
      return;
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
          pdf_filename: selectedFilename,
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || 'Unknown error');
      } else {
        setError('Unknown error');
      }
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
      <button
        type="button"
        onClick={handlePdfUpload}
        disabled={!Boolean(pdfFile) || uploadStatus === 'Upload successful!' || loading}
        className={styles.button}
        style={{ marginBottom: '8px' }}
      >
        {uploadStatus === 'Uploading...' ? 'Uploading...' : uploadStatus === 'Upload successful!' ? 'Uploaded!' : 'Upload PDF'}
      </button>
      {uploadStatus && uploadStatus !== 'Uploading...' && <div>{uploadStatus}</div>}
      {/* PDF selection dropdown */}
      {uploadedFilenames.length > 0 && (
        <label className={styles.formLabel}>
          Select PDF to chat with
          <select
            value={selectedFilename}
            onChange={e => setSelectedFilename(e.target.value)}
            className={styles.input}
          >
            <option value="" disabled>Select a PDF</option>
            {uploadedFilenames.map(filename => (
              <option key={filename} value={filename}>{filename}</option>
            ))}
          </select>
        </label>
      )}
      {/* Show analytics after upload */}
      {analytics && (
        <>
          <BarChart data={analytics} />
          <WordCloud data={analytics} />
        </>
      )}
      {/* Existing fields */}
      <label className={styles.formLabel}>
        User Message
        <textarea value={userMessage} onChange={e => setUserMessage(e.target.value)} required rows={2} className={styles.textarea} />
      </label>
      <label className={styles.formLabel}>
        Model
        <select value={model} onChange={e => setModel(e.target.value)} className={styles.input}>
          {modelOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={loading || (Boolean(pdfFile) && uploadStatus !== 'Upload successful!')} className={styles.button}>
        {loading ? 'Sending...' : 'Send'}
      </button>
      {error && <div className={styles.error}>{error}</div>}
    </form>
  );
};

export default ChatForm; 