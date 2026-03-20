import { useState, useEffect } from 'react';
import '../styles/Modal.scss';

export default function Modal({ isOpen, onClose, onCloseStart, closeDelay = 0, children }) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      setIsClosing(false);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleClose = () => {
    if (onCloseStart) onCloseStart(); // signal parent to start ocean collapse
    setTimeout(() => {
      setIsClosing(true); // modal close animation starts after closeDelay
      setTimeout(onClose, 250); // Match animation duration (0.25s fadeOut/scaleOut)
    }, closeDelay);
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={`modal__backdrop ${isClosing ? 'modal__backdrop--closing' : ''}`} onClick={handleClose} />
      <div className='modal__content'>
        <button className={`modal__close${isClosing ? ' modal__close--closing' : ''}`} onClick={handleClose} aria-label='Close modal'>
          ×
        </button>
        <div className={`modal__content-inner${isClosing ? ' modal__content-inner--closing' : ''}`}>
          {children}
        </div>
      </div>
    </>
  );
}
