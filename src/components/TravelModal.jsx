import Modal from './Modal';
import Card from './Card';
import CardHeader from './CardHeader';
import CardBody from './CardBody';

const TRAVEL_OPTIONS = [
  {
    title: 'By Plane',
    description: 'If you are flying in, the closest airport is Newark Liberty International Airport (EWR), which is about 40 miles from the venue. From there, you can rent a car or take a taxi to the venue. Another option is to fly into John F. Kennedy International Airport (JFK) in New York City, which is about 50 miles away. From JFK, you can also rent a car or take a taxi to the venue.'
  },
  {
    title: 'By Ferry',
    description: 'If you are coming from NY, the ferry could by a nice option. Take the Seastreak Ferry to Conners/Highlands, N.J. Please note their available weekday and weekend scheduled arrival and departure times. Take a taxi (approx. 3 miles) over the Sandy Hook bridge into Sea Bright to reach your destination on the left. Taxis are usually available at the docks.'
  },
  {
    title: 'Driving (Southbound)',
    description: 'Take Garden State Parkway Exit 117. Stay left after the toll and follow signs for Rt. 36 South. Travel 13 Miles (approx. 20 minutes) to the Sandy Hook Bridge (it\'s a huge bridge that will take you onto the peninsula at the Atlantic Ocean – you can\'t miss it.) Stay in the left lane on the bridge and follow signs Rt. 36/Ocean Avenue, Sea Bright. Travel south 2 miles to reach your destination on the left.'
  },
  {
    title: 'Driving (Northbound)',
    description: 'Take Garden State Parkway Exit 105, which brings you onto Rt. 36 East. Travel 6 miles (approx. 12 minutes), and turn left on Rt. 36 North/Ocean Blvd. Travel 4 miles (approx. 7 minutes) and go through 7 traffic lights to reach your destination on the right.'
  },
];

const TAXI_OPTIONS = [
  { name: 'London Taxi', phone: '(732) 291-8000' },
  { name: 'Middletown Yellow Taxi Cab', phone: '(732) 671-4600' },
  { name: 'All the Time Taxi', phone: '(732) 787-1212' },
  { name: 'Go-Go Car Service', phone: '(732) 787-4646' },
];

export default function TravelModal({ isOpen, onClose, onCloseStart, closeDelay }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} onCloseStart={onCloseStart} closeDelay={closeDelay}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', maxWidth: '900px', width: '100%' }}>
        {TRAVEL_OPTIONS.map((option, index) => (
          <Card key={index}>
            <CardHeader>
              <h3>{option.title}</h3>
            </CardHeader>
            <CardBody>
              <p>{option.description}</p>
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <h3>Local Taxis</h3>
          </CardHeader>
          <CardBody>
            <p>Uber works just fine in the area, but if you wanted to call ahead to arrange a pick up:</p>
            <ul>
              {TAXI_OPTIONS.map((taxi, index) => (
                <li key={index}>
                  <strong>{taxi.name}</strong> – {taxi.phone}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </Modal>
  );
}
