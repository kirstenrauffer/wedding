import { useState, useEffect } from 'react';
import '../styles/Modal.scss';

export default function Modal({ isOpen, onClose, children }) {
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
    setIsClosing(true);
    setTimeout(onClose, 1000); // Match animation duration (1s fadeOut/scaleOut)
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={`modal__backdrop ${isClosing ? 'modal__backdrop--closing' : ''}`} onClick={handleClose} />
      <div className={`modal__content ${isClosing ? 'modal__content--closing' : ''}`}>
        <button className='modal__close' onClick={handleClose} aria-label='Close modal'>
          ×
        </button>
        {children}
      </div>
    </>
  );
}
