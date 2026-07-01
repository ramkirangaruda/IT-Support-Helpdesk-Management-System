import type { ComponentType } from 'react';

export interface PlasmaProps {
  color?: string;
  speed?: number;
  direction?: 'forward' | 'reverse' | 'pingpong';
  scale?: number;
  opacity?: number;
  mouseInteractive?: boolean;
}

declare const Plasma: ComponentType<PlasmaProps>;

export default Plasma;