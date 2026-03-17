import '../styles/Card.scss';

export default function CardHeader({ children, className = '' }) {
  return (
    <div className={`card__header ${className}`}>
      {children}
    </div>
  );
}
