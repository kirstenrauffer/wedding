import Modal from './Modal';
import '../styles/HotelModal.scss';

export default function HotelModal({ isOpen, onClose, onCloseStart, closeDelay }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} onCloseStart={onCloseStart} closeDelay={closeDelay}>
      <div className="hotel-cards">
        <a href="https://www.sonesta.com/sonesta-select/nj/tinton-falls/sonesta-select-tinton-falls-eatontown?isGroupCode=true&groupCode=091926ENGI_1&checkin=2026-09-19&checkout=2026-09-21" target="_blank" rel="noopener noreferrer" className="hotel-card hotel-card--featured">
          <div className="hotel-card__image">
            <img src="https://ik.imgkit.net/3vlqs5axxjf/external/https://media.iceportal.com/140553/photos/72026613_XL.jpg?tr=w-1200%2Cfo-auto" alt="Sonesta Select Tinton Falls" />
          </div>
          <div className="hotel-card__content">
            <h3>Sonesta Select</h3>
            <p className="hotel-card__address">600 Hope Rd, Tinton Falls, NJ 07724</p>
            <p className="hotel-card__drive-time">🚗 25 min drive</p>

            <div className="hotel-card__pills">
              <span className="pill">Room Blocks Available</span>
              <span className="pill">Bus Transportation Included</span>
            </div>
            <div className="hotel-card__book-btn">Book</div>
          </div>
        </a>

        <a href="https://www.waveresort.com/" target="_blank" rel="noopener noreferrer" className="hotel-card">
          <div className="hotel-card__image">
            <img src="https://dynamic-media-cdn.tripadvisor.com/media/photo-o/19/2f/4f/dc/wave-resort.jpg?w=900&h=500&s=1" alt="Wave Resort" />
          </div>
          <div className="hotel-card__content">
            <h3>Wave Resort</h3>
            <p className="hotel-card__address">110 Ocean Ave, Long Branch, NJ 07740</p>
            <p className="hotel-card__drive-time">🚗 10 min drive</p>
            <div className="hotel-card__book-btn">Book</div>
          </div>
        </a>

        <a href="https://www.theoysterpointhotel.com/" target="_blank" rel="noopener noreferrer" className="hotel-card">
          <div className="hotel-card__image">
            <img src="https://images.trvl-media.com/lodging/1000000/50000/41800/41752/25576089.jpg?impolicy=resizecrop&rw=575&rh=575&ra=fill" alt="The Oyster Point Hotel" />
          </div>
          <div className="hotel-card__content">
            <h3>The Oyster Point Hotel</h3>
            <p className="hotel-card__address">146 Bodman Pl, Red Bank, NJ 07701</p>
            <p className="hotel-card__drive-time">🚗 20 min drive</p>
            <div className="hotel-card__book-btn">Book</div>
          </div>
        </a>

        <a href="http://themollypitcher.com/" target="_blank" rel="noopener noreferrer" className="hotel-card">
          <div className="hotel-card__image">
            <img src="https://images.trvl-media.com/lodging/1000000/10000/2000/1975/ca460c9b.jpg?impolicy=resizecrop&rw=575&rh=575&ra=fill" alt="The Molly Pitcher Inn" />
          </div>
          <div className="hotel-card__content">
            <h3>The Molly Pitcher Inn</h3>
            <p className="hotel-card__address">88 Riverside Ave, Red Bank, NJ 07701</p>
            <p className="hotel-card__drive-time">🚗 20 min drive</p>
            <div className="hotel-card__book-btn">Book</div>
          </div>
        </a>

        <a href="https://www.beachwalkseabright.com/" target="_blank" rel="noopener noreferrer" className="hotel-card">
          <div className="hotel-card__image">
            <img src="https://dynamic-media-cdn.tripadvisor.com/media/photo-o/29/8e/6a/b2/hotel-exterior.jpg?w=900&h=500&s=1" alt="Beachwalk at Sea Bright" />
          </div>
          <div className="hotel-card__content">
            <h3>Beachwalk at Sea Bright</h3>
            <p className="hotel-card__address">344 Ocean Ave, Sea Bright, NJ 07760</p>
            <p className="hotel-card__drive-time">🚗 5 min drive</p>
            <div className="hotel-card__book-btn">Book</div>
          </div>
        </a>
      </div>
    </Modal>
  );
}
