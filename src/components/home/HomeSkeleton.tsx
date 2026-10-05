import { Bone } from '../app/Skeleton';
import './home-skeleton.css';

/**
 * What Home looks like before it has loaded, in the shapes it will have: an object under "Needs you", a shelf of Circle tiles, three
 * agenda lines. The sizes match the real thing so nothing jumps when it arrives. Announced once, politely.
 */
export function HomeSkeleton() {
  return (
    <div className="hsk" role="status" aria-busy="true" aria-label="Loading your Home">
      <section>
        <Bone w={96} h={20} />
        <div className="hsk__plan">
          <div className="hsk__plan-top">
            <Bone w={56} h={68} style={{ borderRadius: 16 }} />
            <div className="hsk__lines">
              <Bone w={90} h={11} />
              <Bone w="78%" h={20} />
              <Bone w="56%" h={13} />
            </div>
          </div>
          <Bone w="100%" h={44} style={{ borderRadius: 16 }} />
        </div>
        <div className="hsk__ask">
          <Bone w="48%" h={11} />
          <Bone w="82%" h={20} />
          <div className="hsk__chips">
            <Bone w={84} h={44} style={{ borderRadius: 14 }} />
            <Bone w={96} h={44} style={{ borderRadius: 14 }} />
            <Bone w={72} h={44} style={{ borderRadius: 14 }} />
          </div>
        </div>
      </section>
      <section>
        <Bone w={110} h={20} />
        <div className="hsk__tiles">
          <Bone w={152} h={168} className="hsk__tile" />
          <Bone w={152} h={168} className="hsk__tile hsk__tile--alt" />
          <Bone w={152} h={168} className="hsk__tile" />
        </div>
      </section>
      <section>
        <Bone w={96} h={20} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="hsk__row">
            <Bone w={70} h={13} />
            <div className="hsk__lines">
              <Bone w="62%" h={16} />
              <Bone w="40%" h={12} />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
