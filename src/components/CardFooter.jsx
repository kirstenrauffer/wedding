import '../styles/Card.scss';

export default function CardFooter({ children, className = '' }) {
  return (
    <div className={`card__footer ${className}`}>
      {children}
    </div>
  );
}
