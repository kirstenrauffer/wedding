import '../styles/Card.scss';

export default function CardBody({ children, className = '' }) {
  return (
    <div className={`card__body ${className}`}>
      {children}
    </div>
  );
}
