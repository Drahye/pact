import { ContactShadows, Environment, Float, Html, Lightformer, RoundedBox } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import type { UserId } from '../../data/types';
import { getUser } from '../../data/users';
import { formatNaira } from '../../lib/format';
import { palette } from '../../tokens/tokens';
import './payment-scene.css';

export interface Friend {
  userId: UserId;
  color: string;
}

export interface Payment {
  id: number;
  from: number; // friend index
  amount: number;
}

interface Props {
  friends: Friend[];
  percent: number; // 0–100, drives the ring
  payments: Payment[];
  onArrive: (id: number) => void;
  onTapFriend: (index: number) => void;
  center: React.ReactNode;
  running: boolean;
  reduced: boolean;
  compact: boolean;
  /** In-app size: closer camera, smaller orbs, rounder dial. */
  tight?: boolean;
  /** Drag velocity written by the wrapper's pointer handlers. */
  spin: MutableRefObject<number>;
}

const RING_R = 2;
const TUBE = 0.26;
const TAU = Math.PI * 2;

/** Point on the ring at progress `p` (0–1), clockwise from 12 o'clock, in ring space. */
const ringPoint = (p: number, out = new THREE.Vector3()) => out.set(Math.sin(p * TAU) * RING_R, Math.cos(p * TAU) * RING_R, 0);

function GoalRing({ percent, pulse }: { percent: number; pulse: MutableRefObject<number> }) {
  const arc = useRef<THREE.Mesh>(null);
  const endCap = useRef<THREE.Mesh>(null);
  const shown = useRef(percent / 100);
  const built = useRef(-1);
  const mat = useRef<THREE.MeshPhysicalMaterial>(null);

  useFrame((_, dt) => {
    const target = percent / 100;
    shown.current = THREE.MathUtils.damp(shown.current, target, 4, dt);
    const p = Math.max(0.002, Math.min(1, shown.current));
    if (arc.current && Math.abs(p - built.current) > 0.0008) {
      arc.current.geometry.dispose();
      arc.current.geometry = new THREE.TorusGeometry(RING_R, TUBE, 32, 220, p * TAU);
      built.current = p;
    }
    if (endCap.current) ringPoint(p, endCap.current.position);
    if (mat.current) {
      pulse.current = THREE.MathUtils.damp(pulse.current, 0, 3, dt);
      mat.current.emissiveIntensity = 0.12 + pulse.current * 0.9;
    }
  });

  return (
    <group>
      <mesh>
        <torusGeometry args={[RING_R, TUBE, 32, 220]} />
        <meshPhysicalMaterial color={palette.track} roughness={0.6} clearcoat={0.4} />
      </mesh>
      {/* TorusGeometry sweeps counter-clockwise from +x; rotate + mirror so progress starts at 12 and runs clockwise */}
      <group rotation={[0, 0, Math.PI / 2]} scale={[1, -1, 1]}>
        <mesh ref={arc} position={[0, 0, 0.001]}>
          <torusGeometry args={[RING_R, TUBE, 32, 220, 0.01]} />
          <meshPhysicalMaterial ref={mat} color={palette.green} emissive={palette.green} emissiveIntensity={0.12} roughness={0.25} clearcoat={1} clearcoatRoughness={0.15} />
        </mesh>
      </group>
      <mesh position={[0, RING_R, 0.001]}>
        <sphereGeometry args={[TUBE, 24, 24]} />
        <meshPhysicalMaterial color={palette.green} roughness={0.25} clearcoat={1} />
      </mesh>
      <mesh ref={endCap}>
        <sphereGeometry args={[TUBE, 24, 24]} />
        <meshPhysicalMaterial color={palette.green} roughness={0.25} clearcoat={1} />
      </mesh>
    </group>
  );
}

/** A friend: a glossy colour orb with their portrait floating in front. */
function FriendOrb({ friend, index, anchor, onTap, compact, tight }: { friend: Friend; index: number; anchor: (el: THREE.Object3D | null) => void; onTap: () => void; compact: boolean; tight: boolean }) {
  const user = getUser(friend.userId);
  const bob = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (bob.current) bob.current.position.y = Math.sin(clock.elapsedTime * 1.1 + index) * 0.12;
  });
  return (
    <group ref={bob}>
      <mesh ref={anchor}>
        <sphereGeometry args={[tight ? 0.42 : 0.52, 40, 40]} />
        <meshPhysicalMaterial color={friend.color} roughness={0.2} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
      <Html center distanceFactor={tight ? 7 : compact ? 9 : 7.5} zIndexRange={[20, 0]}>
        <button type="button" className="orb" style={{ ['--c' as string]: friend.color }} onClick={onTap} aria-label={`Send a payment from ${user.name}`}>
          {user.photo ? <img src={user.photo} alt="" draggable={false} /> : <span>{user.name[0]}</span>}
          <span className="orb__name">{user.name}</span>
        </button>
      </Html>
    </group>
  );
}

/** A coin that arcs from a friend into the leading edge of the ring. */
function Coin({ payment, color, fromRef, percent, onArrive, reduced }: { payment: Payment; color: string; fromRef: THREE.Object3D | null; percent: number; onArrive: () => void; reduced: boolean }) {
  const coin = useRef<THREE.Group>(null);
  const trail = useRef<THREE.InstancedMesh>(null);
  const t = useRef(0);
  const done = useRef(false);
  const start = useMemo(() => new THREE.Vector3(), []);
  const history = useRef<THREE.Vector3[]>([]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const DURATION = 1.25;

  useEffect(() => {
    if (fromRef) fromRef.getWorldPosition(start);
    if (reduced) {
      done.current = true;
      onArrive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((_, dt) => {
    if (done.current || !coin.current) return;
    t.current = Math.min(1, t.current + dt / DURATION);
    const e = t.current < 0.5 ? 2 * t.current * t.current : 1 - Math.pow(-2 * t.current + 2, 2) / 2;
    // target: the leading edge of the progress arc (ring sits at the origin, facing the camera)
    const end = ringPoint(Math.min(1, percent / 100));
    const ctrl = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 2.4, 1.6));
    const a = start.clone().lerp(ctrl, e);
    const b = ctrl.clone().lerp(end, e);
    const pos = a.lerp(b, e);
    coin.current.position.copy(pos);
    coin.current.rotation.y += dt * 9;
    coin.current.scale.setScalar(t.current > 0.85 ? 1 - (t.current - 0.85) * 5 : Math.min(1, t.current * 6));
    history.current.unshift(pos.clone());
    history.current.length = Math.min(history.current.length, 14);
    if (trail.current) {
      history.current.forEach((p, i) => {
        dummy.position.copy(p);
        dummy.scale.setScalar(Math.max(0.01, 0.1 * (1 - i / 14)));
        dummy.updateMatrix();
        trail.current!.setMatrixAt(i, dummy.matrix);
      });
      trail.current.count = history.current.length;
      trail.current.instanceMatrix.needsUpdate = true;
    }
    if (t.current >= 1) {
      done.current = true;
      onArrive();
    }
  });

  if (reduced) return null;
  return (
    <>
      <group ref={coin} scale={0}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.26, 0.26, 0.07, 40]} />
          <meshPhysicalMaterial color={color} metalness={0.35} roughness={0.25} clearcoat={1} />
        </mesh>
        <Html center zIndexRange={[30, 20]}>
          <span className="coin-label" style={{ ['--c' as string]: color }}>
            +{formatNaira(payment.amount)}
          </span>
        </Html>
      </group>
      <instancedMesh ref={trail} args={[undefined, undefined, 14]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.55} />
      </instancedMesh>
    </>
  );
}

/** Soft, colourful geometry that gives the scene depth without saying anything. */
function Shapes({ compact }: { compact: boolean }) {
  const items = compact
    ? [
        { p: [-3.6, 2.6, -3], c: '#ffc53d', k: 'box' },
        { p: [3.8, -1.8, -2.5], c: '#9b7bff', k: 'ico' },
        { p: [3.2, 2.8, -4], c: '#ff6fb5', k: 'torus' },
      ]
    : [
        { p: [-6.2, 2.4, -3], c: '#ffc53d', k: 'box' },
        { p: [6.4, -1.4, -2.5], c: '#9b7bff', k: 'ico' },
        { p: [5.2, 3.1, -4], c: '#ff6fb5', k: 'torus' },
        { p: [-5.4, -2.2, -2], c: '#4da3ff', k: 'capsule' },
        { p: [-2.6, 3.6, -5], c: '#ff7a5c', k: 'ico' },
        { p: [2.2, -3.2, -3.5], c: '#22b8a6', k: 'box' },
      ];
  return (
    <>
      {items.map((it, i) => (
        <Float key={i} speed={1.4} rotationIntensity={1.2} floatIntensity={1.4} position={it.p as [number, number, number]}>
          {it.k === 'box' && (
            <RoundedBox args={[0.8, 0.8, 0.8]} radius={0.2} smoothness={4}>
              <meshPhysicalMaterial color={it.c} roughness={0.3} clearcoat={1} />
            </RoundedBox>
          )}
          {it.k === 'ico' && (
            <mesh>
              <icosahedronGeometry args={[0.5, 0]} />
              <meshPhysicalMaterial color={it.c} roughness={0.35} clearcoat={1} flatShading />
            </mesh>
          )}
          {it.k === 'torus' && (
            <mesh>
              <torusGeometry args={[0.42, 0.16, 24, 64]} />
              <meshPhysicalMaterial color={it.c} roughness={0.25} clearcoat={1} />
            </mesh>
          )}
          {it.k === 'capsule' && (
            <mesh rotation={[0, 0, 0.6]}>
              <capsuleGeometry args={[0.28, 0.7, 12, 24]} />
              <meshPhysicalMaterial color={it.c} roughness={0.3} clearcoat={1} />
            </mesh>
          )}
        </Float>
      ))}
    </>
  );
}

function Rig({ spin, running, reduced }: { spin: MutableRefObject<number>; running: boolean; reduced: boolean }) {
  const { camera, pointer } = useThree();
  useFrame((_, dt) => {
    if (reduced) return;
    // gentle parallax toward the pointer
    camera.position.x = THREE.MathUtils.damp(camera.position.x, pointer.x * 0.8, 2, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.4 + pointer.y * 0.6, 2, dt);
    camera.lookAt(0, 0, 0);
    if (!running) spin.current *= 0.9;
  });
  return null;
}

function Orbit({ friends, spin, running, reduced, compact, tight, anchors, onTapFriend }: {
  tight: boolean;
  friends: Friend[];
  spin: MutableRefObject<number>;
  running: boolean;
  reduced: boolean;
  compact: boolean;
  anchors: MutableRefObject<(THREE.Object3D | null)[]>;
  onTapFriend: (i: number) => void;
}) {
  const group = useRef<THREE.Group>(null);
  // Friends sit on a dial around the ring's face, so nobody ever covers the total.
  const rx = tight ? 2.85 : compact ? 2.55 : 4.6;
  const ry = tight ? 3.2 : compact ? 3.5 : 3.1;
  const angle = useRef(0);
  const place = (i: number, a: number) =>
    [Math.cos(a) * rx, Math.sin(a) * ry, Math.sin(a * 2 + i) * 0.9] as [number, number, number];
  useFrame((_, dt) => {
    if (!group.current) return;
    const auto = reduced || !running ? 0 : 0.1;
    angle.current += (auto + spin.current) * dt;
    spin.current *= Math.pow(0.08, dt); // inertia
    group.current.children.forEach((child, i) => {
      child.position.set(...place(i, (i / friends.length) * TAU + angle.current));
    });
  });
  return (
    <group ref={group}>
      {friends.map((f, i) => (
        // initial position set here too, so a static (reduced-motion) scene is laid out correctly
        <group key={f.userId} position={place(i, (i / friends.length) * TAU)}>
          <FriendOrb friend={f} index={i} anchor={(el) => (anchors.current[i] = el)} onTap={() => onTapFriend(i)} compact={compact} tight={tight} />
        </group>
      ))}
    </group>
  );
}

export default function PaymentScene({ friends, percent, payments, onArrive, onTapFriend, center, running, reduced, compact, tight = false, spin }: Props) {
  const anchors = useRef<(THREE.Object3D | null)[]>([]);
  const pulse = useRef(0);
  return (
    <Canvas
      className="payment-scene"
      dpr={[1, 2]}
      camera={{ position: [0, 0.4, tight ? 9.6 : compact ? 13.5 : 11], fov: tight ? 42 : compact ? 44 : 38 }}
      gl={{ antialias: true, alpha: true }}
      frameloop={running || payments.length ? 'always' : 'demand'}
    >
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 8, 6]} intensity={1.4} />
      <Environment resolution={128}>
        <Lightformer intensity={2} position={[0, 5, 5]} scale={[10, 4, 1]} />
        <Lightformer intensity={1} position={[-6, 0, 2]} scale={[2, 8, 1]} color="#fff3cf" />
        <Lightformer intensity={1} position={[6, 0, 2]} scale={[2, 8, 1]} color="#eaf4ff" />
      </Environment>

      <Rig spin={spin} running={running} reduced={reduced} />
      {!tight && <Shapes compact={compact} />}
      <GoalRing percent={percent} pulse={pulse} />
      <Html center zIndexRange={[10, 0]}>
        {center}
      </Html>
      <Orbit friends={friends} spin={spin} running={running} reduced={reduced} compact={compact} tight={tight} anchors={anchors} onTapFriend={onTapFriend} />
      {payments.map((p) => (
        <Coin
          key={p.id}
          payment={p}
          color={friends[p.from].color}
          fromRef={anchors.current[p.from]}
          percent={percent}
          reduced={reduced}
          onArrive={() => {
            pulse.current = 1;
            onArrive(p.id);
          }}
        />
      ))}
      <ContactShadows position={[0, -4.2, 0]} opacity={0.22} scale={16} blur={2.8} far={5} />
    </Canvas>
  );
}
