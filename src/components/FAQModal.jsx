import Modal from './Modal';
import Card from './Card';
import CardHeader from './CardHeader';
import CardBody from './CardBody';

export default function FAQModal({ isOpen, onClose, onCloseStart, closeDelay }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} onCloseStart={onCloseStart} closeDelay={closeDelay}>
      <Card>
        <CardHeader>
          <h2>Frequently Asked Questions</h2>
        </CardHeader>
        <CardBody>
          <ul>
            <li>What time should I arrive?</li>
            <li>What is the dress code?</li>
            <li>Are children invited?</li>
            <li>What is the parking situation?</li>
          </ul>
        </CardBody>
      </Card>
    </Modal>
  );
}
