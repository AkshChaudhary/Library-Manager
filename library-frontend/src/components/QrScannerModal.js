import { useState } from 'react';

// Simulated scanner. Real camera scanning needs a library such as html5-qrcode.
export default function QrScannerModal({ sampleIsbns, onScan, onClose }) {
  const [scanning, setScanning] = useState(false);
  const [manualIsbn, setManualIsbn] = useState('');

  const simulateScan = () => {
    if (sampleIsbns.length === 0) return;
    setScanning(true);
    setTimeout(() => {
      const isbn = sampleIsbns[Math.floor(Math.random() * sampleIsbns.length)];
      onScan(isbn);
    }, 1200);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2>Scan a book</h2>
        <p className="muted small">Point the camera at the barcode, or type the ISBN.</p>

        <div className={`qr-frame ${scanning ? 'scanning' : ''}`}>
          <span className="muted">{scanning ? 'Scanning…' : 'Camera preview (simulated)'}</span>
        </div>

        <div className="actions">
          <button className="btn" onClick={simulateScan} disabled={scanning || sampleIsbns.length === 0}>
            Simulate scan
          </button>
        </div>

        <div className="field" style={{ marginTop: 18 }}>
          <label htmlFor="manual-isbn">Or enter ISBN</label>
          <div className="actions" style={{ marginTop: 0 }}>
            <input
              id="manual-isbn"
              value={manualIsbn}
              onChange={(e) => setManualIsbn(e.target.value)}
              placeholder="e.g. 9780140449136"
              style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)' }}
            />
            <button className="btn ghost" onClick={() => manualIsbn.trim() && onScan(manualIsbn.trim())}>
              Use ISBN
            </button>
          </div>
        </div>

        <div className="actions">
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}