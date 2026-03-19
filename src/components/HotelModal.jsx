import Modal from './Modal';
import Card from './Card';
import CardHeader from './CardHeader';
import CardBody from './CardBody';

export default function HotelModal({ isOpen, onClose, onCloseStart, closeDelay }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} onCloseStart={onCloseStart} closeDelay={closeDelay}>
      <Card>
        <CardHeader>
          <h2>Hotel Accommodations</h2>
        </CardHeader>
        <CardBody>
          <p>Information about nearby hotels and accommodations will be provided.</p>
        </CardBody>
      </Card>
    </Modal>
  );
}
