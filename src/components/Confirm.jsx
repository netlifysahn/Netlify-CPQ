import React from 'react';

export default function Confirm({ msg, onYes, onNo }) {
  return (
    <div className="modal-overlay" onClick={onNo}>
      <div className="modal confirm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-title">Confirm</div>
        <div className="confirm-message">{msg}</div>
        <div className="confirm-actions">
          <button className="btn-secondary" onClick={onNo}>Cancel</button>
          <button className="btn-destructive" onClick={onYes}>Delete</button>
        </div>
      </div>
    </div>
  );
}
