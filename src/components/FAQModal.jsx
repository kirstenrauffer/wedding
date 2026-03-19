import { useState } from 'react';
import Modal from './Modal';
import Card from './Card';
import CardHeader from './CardHeader';
import CardBody from './CardBody';
import '../styles/FAQModal.scss';

const FAQ_ITEMS = [
  {
    question: 'What time should I arrive?',
    answer: 'The ceremony begins at 5:30 PM. Doors will open at 5:00 PM, and we recommend arriving early to find parking and get settled before the ceremony starts.'
  },
  {
    question: 'What time does the first bus leave the hotel for the venue?',
    answer: 'There will be two bus trips. The first bus will leave the hotel at 4:30 PM. Please plan to board the bus at least 5 minutes early.'
  },
  {
    question: 'What time does the bus leave the venue to the hotel?',
    answer: 'There will be two bus trips. The first bus will leave the venue at 10:30 PM, the second bus will leave the venue at 11:00 PM. Please plan to board the bus at least 5 minutes early.'
  },
  {
    question: 'What is the dress code?',
    answer: 'Festive... Formal? Formal attire with colors encouraged.  The ceremony will be outdoors on the beach, and the rest of the evening will allow for both hanging out on the beach, or hanging out indoors or on the balcony.'
  },
  {
    question: 'Are children invited?',
    answer: 'Children are welcome! However, we do not have childcare available at the venue.'
  },
  {
    question: 'What is the parking situation?',
    answer: 'There is free parking available at the venue.'
  },
];

function FAQItem({ question, answer, isExpanded, onToggle }) {
  return (
    <li className="faq-item">
      <button
        className="faq-item__header"
        onClick={onToggle}
        aria-expanded={isExpanded}
      >
        <span className="faq-item__question">{question}</span>
        <span className="faq-item__toggle">{isExpanded ? '−' : '+'}</span>
      </button>
      {isExpanded && <div className="faq-item__answer">{answer}</div>}
    </li>
  );
}

export default function FAQModal({ isOpen, onClose, onCloseStart, closeDelay }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  const handleToggle = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} onCloseStart={onCloseStart} closeDelay={closeDelay}>
      <Card className="faq-card">
        <CardHeader>
          <h2>Frequently Asked Questions</h2>
        </CardHeader>
        <CardBody>
          <ul className="faq-list">
            {FAQ_ITEMS.map((item, index) => (
              <FAQItem
                key={index}
                question={item.question}
                answer={item.answer}
                isExpanded={expandedIndex === index}
                onToggle={() => handleToggle(index)}
              />
            ))}
          </ul>
        </CardBody>
      </Card>
    </Modal>
  );
}
