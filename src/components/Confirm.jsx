import React from 'react';
import { S } from '../styles/theme';

export default function Confirm({ msg, onYes, onNo }) {
  return (
    <div style={S.overlay} onClick={onNo}>
      <div style={{ ...S.modal, maxWidth: 380, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, color: '#f0f2f5', fontWeight: 600, marginBottom: 8 }}>Confirm</div>
        <div style={{ fontSize: 13, color: '#8b95a5', marginBottom: 24 }}>{msg}</div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          <button style={S.canBtn} onClick={onNo}>Cancel</button>
          <button style={{ ...S.saveBtn, background: '#ef4444' }} onClick={onYes}>Delete</button>
        </div>
      </div>
    </div>
  );
}
