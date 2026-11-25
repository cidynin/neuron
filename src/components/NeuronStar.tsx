import { motion } from 'motion/react';

interface NeuronStarProps {
  isOpen?: boolean;
  size?: number;
  className?: string;
}

const STAR_POINTS =
  '16.00,1.80 17.63,10.43 23.68,4.05 20.38,12.20 28.92,10.10 21.74,15.17 30.06,18.02 21.28,18.41 26.73,25.30 19.14,20.88 20.00,29.62 16.00,21.80 12.00,29.62 12.86,20.88 5.27,25.30 10.72,18.41 1.94,18.02 10.26,15.17 3.08,10.10 11.62,12.20 8.32,4.05 14.37,10.43';

export function NeuronStar({ isOpen = false, size = 38, className = '' }: NeuronStarProps) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ color: 'var(--neuron-star)' }}
      animate={{
        rotate: isOpen ? 48 : 0,
        scale: isOpen ? 1.05 : 1,
      }}
      whileHover={{
        scale: isOpen ? 1.1 : 1.08,
        rotate: isOpen ? 60 : 14,
      }}
      whileTap={{
        scale: 0.92,
      }}
      transition={{
        type: 'spring',
        stiffness: 310,
        damping: 20,
        mass: 0.72,
      }}
    >
      <polygon points={STAR_POINTS} fill="currentColor" />
    </motion.svg>
  );
}

interface JewelCrestProps {
  isTyping: boolean;
  isFocused: boolean;
}

export function JewelCrest({ isTyping, isFocused }: JewelCrestProps) {
  return (
    <svg
      width="3"
      height="44"
      viewBox="0 0 4 48"
      fill="none"
      aria-hidden="true"
      className={`pointer-events-none block select-none ${
        isTyping
          ? 'neuron-jewel-typing'
          : isFocused
            ? 'neuron-jewel-steady'
            : 'opacity-0'
      }`}
      style={{
        height: '100%',
        width: '2.5px',
        color: 'var(--neuron-jewel)',
      }}
    >
      {/* Crisp vertical bar typing crest */}
      <rect x="0.5" y="0" width="3" height="48" rx="1" fill="currentColor" />
    </svg>
  );
}
