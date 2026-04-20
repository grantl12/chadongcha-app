import React, { useRef, useEffect } from 'react';
import { View, Animated } from 'react-native';
import Svg, {
  G, Path, Circle, Polygon, Defs, RadialGradient, LinearGradient,
  Stop, ClipPath, Line, Rect, Text as SvgText,
} from 'react-native-svg';
import type { Badge } from '@/utils/badges';

// ─── Icon Library — 40×40 coordinate space ───────────────────────────────────

function IconCarCoupe() {
  return <G>
    <Path d="M3 29L5 22L11 16L29 16L35 22L37 29Z" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M11 16L14 11L26 11L29 16Z" fill="rgba(255,255,255,0.35)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M15 16L17 12L25 12L27 16Z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Circle cx="12" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="12" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
    <Circle cx="28" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="28" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
    <Path d="M3 33L37 33" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"/>
  </G>;
}

function IconCarSuv() {
  return <G>
    <Path d="M3 29L3 19L8 13L32 13L37 19L37 29Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M8 13L8 19L32 19L32 13" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Circle cx="11" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="11" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
    <Circle cx="29" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="29" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
  </G>;
}

function IconCarTruck() {
  return <G>
    <Path d="M3 29L3 18L10 13L22 13L22 18L37 18L37 29Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M22 18L22 29" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
    <Circle cx="10" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="10" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
    <Circle cx="29" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="29" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
  </G>;
}

function IconCarDrop() {
  return <G>
    <Path d="M3 29L5 22L9 17L31 17L35 22L37 29Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M11 17Q13 12 20 11Q27 12 29 17" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
    <Circle cx="11" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="11" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
    <Circle cx="29" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="29" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
  </G>;
}

function IconCarHatch() {
  return <G>
    <Path d="M3 29L5 21L10 15L28 15L34 21L37 29Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M10 15L13 11L24 11L28 15" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" fill="rgba(255,255,255,0.15)" strokeLinejoin="round"/>
    <Circle cx="11" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="11" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
    <Circle cx="28" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="28" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
  </G>;
}

function IconCarVan() {
  return <G>
    <Path d="M3 29L3 13L9 9L33 9L37 13L37 29Z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Rect x="6" y="11" width="7" height="7" rx="1" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Rect x="15" y="11" width="7" height="7" rx="1" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Rect x="24" y="11" width="7" height="7" rx="1" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Circle cx="10" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="10" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
    <Circle cx="30" cy="29" r="4" fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Circle cx="30" cy="29" r="1.8" fill="rgba(255,255,255,0.6)"/>
  </G>;
}

function IconCarMuscle() {
  return <G>
    <Path d="M1 29L3 21L7 16L33 16L37 21L39 29Z" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.95)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M8 16L11 12L29 12L32 16Z" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M17 16L17 14L23 14L23 16" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" fill="rgba(255,255,255,0.1)"/>
    <Circle cx="9" cy="29" r="5" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.95)" strokeWidth="1.3"/>
    <Circle cx="9" cy="29" r="2.2" fill="rgba(255,255,255,0.7)"/>
    <Circle cx="31" cy="29" r="5" fill="rgba(0,0,0,0.35)" stroke="rgba(255,255,255,0.95)" strokeWidth="1.3"/>
    <Circle cx="31" cy="29" r="2.2" fill="rgba(255,255,255,0.7)"/>
  </G>;
}

function IconCrown() {
  return <G>
    <Path d="M6 28L8 28L8 25L32 25L32 28L34 28" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M8 25L8 14L14 20L20 10L26 20L32 14L32 25Z" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Circle cx="20" cy="10" r="2.5" fill="rgba(255,255,255,0.9)"/>
    <Circle cx="8" cy="14" r="2" fill="rgba(255,255,255,0.8)"/>
    <Circle cx="32" cy="14" r="2" fill="rgba(255,255,255,0.8)"/>
    <Path d="M17 25L20 19L23 25Z" fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5"/>
  </G>;
}

function IconGem() {
  return <G>
    <Path d="M20 5L34 15L20 38L6 15Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M12 15L20 5L28 15Z" fill="rgba(255,255,255,0.4)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" strokeLinejoin="round"/>
    <Path d="M6 15L34 15" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Path d="M12 15L20 38" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6"/>
    <Path d="M28 15L20 38" stroke="rgba(255,255,255,0.2)" strokeWidth="0.6"/>
    <Path d="M14 11L18 13" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
  </G>;
}

function IconStarburst() {
  return <G>
    <Path d="M20 3L23 13L33 10L26 18L36 20L26 22L33 30L23 27L20 37L17 27L7 30L14 22L4 20L14 18L7 10L17 13Z" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M20 11L22 16L27 16L23 19L25 24L20 21L15 24L17 19L13 16L18 16Z" fill="rgba(255,255,255,0.5)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" strokeLinejoin="round"/>
    <Circle cx="20" cy="20" r="3" fill="white" opacity="0.9"/>
  </G>;
}

function IconLightning() {
  return <G>
    <Path d="M25 4L11 20L18 20L15 36L29 18L22 18Z" fill="rgba(255,255,255,0.9)" stroke="rgba(255,255,255,0.9)" strokeWidth="1" strokeLinejoin="round"/>
    <Circle cx="22" cy="4" r="1.5" fill="rgba(255,255,255,0.7)"/>
  </G>;
}

function IconSatellite() {
  return <G>
    <Rect x="15" y="16" width="10" height="8" rx="1.5" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Rect x="3" y="17" width="10" height="6" rx="1" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth="1"/>
    <Path d="M5 17L5 23M8 17L8 23M11 17L11 23" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6"/>
    <Rect x="27" y="17" width="10" height="6" rx="1" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth="1"/>
    <Path d="M29 17L29 23M32 17L32 23M35 17L35 23" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6"/>
    <Path d="M20 16Q20 10 24 8Q24 12 20 16" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8"/>
    <Path d="M22 8L26 4" stroke="rgba(255,255,255,0.8)" strokeWidth="1" strokeLinecap="round"/>
    <Circle cx="26" cy="4" r="1.5" fill="rgba(255,255,255,0.9)"/>
  </G>;
}

function IconSpeedometer() {
  return <G>
    <Path d="M5 28A15 15 0 0 1 35 28" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <Path d="M28.7 15.3A15 15 0 0 1 35 28" stroke="rgba(255,80,80,0.8)" strokeWidth="3" fill="none" strokeLinecap="round"/>
    <Path d="M20 28L30 14" stroke="rgba(255,255,255,0.95)" strokeWidth="1.8" strokeLinecap="round"/>
    <Circle cx="20" cy="28" r="3" fill="rgba(255,255,255,0.9)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.5"/>
  </G>;
}

function IconGlobe() {
  return <G>
    <Circle cx="20" cy="20" r="15" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3"/>
    <Path d="M5 20Q20 25 35 20" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" fill="none"/>
    <Path d="M7 14Q20 19 33 14" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" fill="none"/>
    <Path d="M7 26Q20 31 33 26" stroke="rgba(255,255,255,0.3)" strokeWidth="0.6" fill="none"/>
    <Path d="M20 5Q26 12 26 20Q26 28 20 35" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" fill="none"/>
    <Path d="M20 5Q14 12 14 20Q14 28 20 35" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" fill="none"/>
    <Path d="M11 10Q16 9 19 13" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
  </G>;
}

function IconWrench() {
  return <G>
    <Path d="M28 6A7 7 0 0 0 22 18L9 31A3.5 3.5 0 0 0 14 36L27 23A7 7 0 0 0 28 6Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M22 18L12 28" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
    <Circle cx="9" cy="31" r="2" fill="rgba(255,255,255,0.6)"/>
  </G>;
}

function IconShield() {
  return <G>
    <Path d="M20 4L34 9L34 22Q34 31 20 36Q6 31 6 22L6 9Z" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.4" strokeLinejoin="round"/>
    <Path d="M20 8L30 12L30 21Q30 28 20 32Q10 28 10 21L10 12Z" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" strokeLinejoin="round"/>
    <Circle cx="20" cy="19" r="5" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8"/>
    <Path d="M20 14L20 24M15 19L25 19" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
  </G>;
}

function IconSunRays() {
  return <G>
    <Circle cx="20" cy="20" r="8" fill="rgba(255,255,255,0.8)" stroke="rgba(255,255,255,0.9)" strokeWidth="0.8"/>
    {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => {
      const r = Math.PI * deg / 180;
      const long = i % 2 === 0;
      const x1 = 20 + 9 * Math.cos(r), y1 = 20 + 9 * Math.sin(r);
      const x2 = 20 + (long ? 17 : 14) * Math.cos(r), y2 = 20 + (long ? 17 : 14) * Math.sin(r);
      return <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(255,255,255,0.9)" strokeWidth={long ? 2 : 1.2} strokeLinecap="round"/>;
    })}
    <Circle cx="20" cy="20" r="5" fill="white" opacity="0.9"/>
  </G>;
}

function IconTrophy() {
  return <G>
    <Path d="M13 6L27 6L27 20Q27 27 20 29Q13 27 13 20Z" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M8 8L13 8L13 18Q8 18 8 13Z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
    <Path d="M32 8L27 8L27 18Q32 18 32 13Z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
    <Rect x="13" y="33" width="14" height="3" rx="1" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8"/>
    <Path d="M20 10L21.5 14L26 14L22.5 16.5L24 21L20 18L16 21L17.5 16.5L14 14L18.5 14Z" fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5"/>
  </G>;
}

function IconClock() {
  return <G>
    <Circle cx="20" cy="20" r="15" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5"/>
    <Path d="M20 20L20 10" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round"/>
    <Path d="M20 20L27 20" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
    <Circle cx="20" cy="20" r="2.2" fill="rgba(255,255,255,0.9)"/>
  </G>;
}

function IconRocket() {
  return <G>
    <Path d="M20 4Q27 8 27 22L20 26L13 22Q13 8 20 4Z" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Circle cx="20" cy="15" r="3.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth="1"/>
    <Circle cx="20" cy="15" r="1.5" fill="rgba(255,255,255,0.6)"/>
    <Path d="M13 22Q9 25 8 30L13 27Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeLinejoin="round"/>
    <Path d="M27 22Q31 25 32 30L27 27Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.7)" strokeWidth="1" strokeLinejoin="round"/>
    <Path d="M17 26Q16 32 20 35Q24 32 23 26" fill="rgba(255,180,0,0.6)" stroke="rgba(255,120,0,0.8)" strokeWidth="0.8" strokeLinejoin="round"/>
  </G>;
}

function IconMountain() {
  return <G>
    <Path d="M4 34L20 8L36 34Z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M14 22L20 8L26 22Q22 24 20 23Q18 24 14 22Z" fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" strokeLinejoin="round"/>
    <Path d="M22 34L32 16L40 34" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" strokeLinejoin="round"/>
  </G>;
}

function IconHorse() {
  return <G>
    <Path d="M10 28Q10 20 14 18L16 12Q17 8 20 7Q24 7 25 10L26 14Q30 16 31 22L31 28" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M16 12Q14 9 15 7Q17 5 20 7Q24 7 25 10L26 14L24 14Q22 11 20 11Q17 11 16 12Z" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" strokeLinejoin="round"/>
    <Path d="M14 28L13 35M17 28L17 35M24 28L24 35M27 28L28 35" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
    <Circle cx="22" cy="10" r="1.2" fill="rgba(255,255,255,0.9)"/>
  </G>;
}

function IconBullHorns() {
  return <G>
    <Path d="M20 28Q14 28 11 22Q8 18 10 13Q12 9 15 12Q16 18 20 18Q24 18 25 12Q28 9 30 13Q32 18 29 22Q26 28 20 28Z" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M8 8Q6 4 10 4Q12 6 12 10" stroke="rgba(255,255,255,0.8)" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <Path d="M32 8Q34 4 30 4Q28 6 28 10" stroke="rgba(255,255,255,0.8)" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <Circle cx="20" cy="28" r="3" fill="rgba(255,255,255,0.3)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8"/>
  </G>;
}

function IconRobot() {
  return <G>
    <Rect x="11" y="13" width="18" height="16" rx="2" fill="rgba(255,255,255,0.2)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2"/>
    <Rect x="9" y="29" width="22" height="7" rx="1.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
    <Rect x="7" y="17" width="4" height="8" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Rect x="29" y="17" width="4" height="8" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8"/>
    <Circle cx="16" cy="19" r="2.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth="1"/>
    <Circle cx="24" cy="19" r="2.5" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.8)" strokeWidth="1"/>
    <Circle cx="16" cy="19" r="1" fill="rgba(255,255,255,0.9)"/>
    <Circle cx="24" cy="19" r="1" fill="rgba(255,255,255,0.9)"/>
    <Path d="M15 24L25 24" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round"/>
    <Path d="M20 13L20 9" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" strokeLinecap="round"/>
    <Circle cx="20" cy="8" r="2" fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.9)" strokeWidth="0.8"/>
  </G>;
}

function IconBook() {
  return <G>
    <Path d="M8 8L8 34L28 34Q33 34 33 29L33 8Z" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M8 8Q8 5 13 5L33 5L33 8" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" strokeLinejoin="round"/>
    <Path d="M13 14L28 14M13 19L28 19M13 24L22 24" stroke="rgba(255,255,255,0.5)" strokeWidth="1" strokeLinecap="round"/>
    <Path d="M8 30Q8 34 13 34" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" fill="none" strokeLinecap="round"/>
  </G>;
}

function IconHook() {
  return <G>
    <Path d="M20 6Q28 6 28 14Q28 22 20 26Q14 28 12 33Q11 36 14 37Q17 38 19 35" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <Circle cx="20" cy="6" r="3" fill="rgba(255,255,255,0.5)" stroke="rgba(255,255,255,0.9)" strokeWidth="1"/>
  </G>;
}

function IconFlagUs() {
  return <G>
    <Rect x="7" y="8" width="26" height="18" rx="1" fill="rgba(255,255,255,0.1)" stroke="rgba(255,255,255,0.7)" strokeWidth="1"/>
    <Rect x="7" y="8" width="26" height="4" fill="rgba(220,50,50,0.6)"/>
    <Rect x="7" y="16" width="26" height="4" fill="rgba(220,50,50,0.6)"/>
    <Rect x="7" y="8" width="10" height="10" fill="rgba(30,60,150,0.7)"/>
    <Circle cx="9.5" cy="10.5" r="0.8" fill="rgba(255,255,255,0.9)"/>
    <Circle cx="12.5" cy="10.5" r="0.8" fill="rgba(255,255,255,0.9)"/>
    <Circle cx="15.5" cy="10.5" r="0.8" fill="rgba(255,255,255,0.9)"/>
    <Circle cx="11" cy="13" r="0.8" fill="rgba(255,255,255,0.9)"/>
    <Circle cx="14" cy="13" r="0.8" fill="rgba(255,255,255,0.9)"/>
    <Path d="M7 27L7 26L33 26" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"/>
    <Path d="M8 28L8 8" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" strokeLinecap="round"/>
  </G>;
}

function IconFist() {
  return <G>
    <Path d="M14 26L12 18L14 14L18 13L20 8L22 8L23 13L26 13L27 16L28 13L31 13L32 16L32 26Q32 30 23 32Q14 30 14 26Z" fill="rgba(255,255,255,0.25)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.3" strokeLinejoin="round"/>
    <Path d="M18 13L18 22M22 13L22 22M26 13L26 22" stroke="rgba(255,255,255,0.3)" strokeWidth="0.8"/>
    <Path d="M14 20L32 20" stroke="rgba(255,255,255,0.2)" strokeWidth="0.8"/>
    <Path d="M12 18L9 20Q7 24 10 25L14 25" stroke="rgba(255,255,255,0.6)" strokeWidth="1.2" fill="none" strokeLinejoin="round"/>
  </G>;
}

function IconArrows360() {
  return <G>
    <Path d="M20 8A12 12 0 0 1 32 20" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <Path d="M32 20A12 12 0 0 1 14 31" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <Path d="M14 31A12 12 0 0 1 20 8" stroke="rgba(255,255,255,0.5)" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
    <Path d="M32 16L32 20L28 20" stroke="rgba(255,255,255,0.9)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M17 34L14 31L16 27" stroke="rgba(255,255,255,0.7)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <Path d="M17 5L20 8L17 11" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <SvgText x="15" y="23" fill="rgba(255,255,255,0.9)" fontSize="7" fontWeight="800">360</SvgText>
  </G>;
}

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_COMPONENTS: Record<string, React.FC> = {
  car_coupe:    IconCarCoupe,
  car_suv:      IconCarSuv,
  car_truck:    IconCarTruck,
  car_drop:     IconCarDrop,
  car_hatch:    IconCarHatch,
  car_van:      IconCarVan,
  car_muscle:   IconCarMuscle,
  crown:        IconCrown,
  gem:          IconGem,
  starburst:    IconStarburst,
  lightning:    IconLightning,
  satellite:    IconSatellite,
  speedometer:  IconSpeedometer,
  globe:        IconGlobe,
  wrench:       IconWrench,
  shield:       IconShield,
  sun_rays:     IconSunRays,
  trophy:       IconTrophy,
  clock:        IconClock,
  rocket:       IconRocket,
  mountain:     IconMountain,
  horse:        IconHorse,
  bull_horns:   IconBullHorns,
  robot:        IconRobot,
  book:         IconBook,
  hook:         IconHook,
  flag_us:      IconFlagUs,
  fist:         IconFist,
  arrows_360:   IconArrows360,
  people:       IconGlobe,  // fallback
};

// ─── HexBadge component ───────────────────────────────────────────────────────

interface HexBadgeProps {
  badge: Badge;
  size?: number;
  pulseGlow?: boolean;
}

export function HexBadge({ badge, size = 80, pulseGlow = false }: HexBadgeProps) {
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pulseGlow && badge.earned) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 1500, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1500, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [pulseGlow, badge.earned]);

  const W = size;
  const H = size * 1.1547;
  const cx = W / 2;
  const cy = H / 2;
  const R = W / 2 - 2;
  const Ri = R - 5 * (size / 100);

  const pts = [0, 1, 2, 3, 4, 5].map(i => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
  });
  const poly = pts.map(p => `${p.x},${p.y}`).join(' ');

  const iPts = [0, 1, 2, 3, 4, 5].map(i => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return { x: cx + Ri * Math.cos(a), y: cy + Ri * Math.sin(a) };
  });
  const innerPoly = iPts.map(p => `${p.x},${p.y}`).join(' ');

  const uid = badge.id.replace(/[^a-zA-Z0-9]/g, '_');
  const iconScale = (size / 100) * 0.56;
  const iconSize = 40 * iconScale;
  const ix = cx - iconSize / 2;
  const iy = cy - iconSize / 2 - size * 0.04;

  const IconComponent = ICON_COMPONENTS[badge.icon] ?? IconCarCoupe;

  const shadowStyle = badge.earned ? {
    shadowColor: badge.color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 8,
    elevation: 8,
  } : {};

  return (
    <Animated.View style={[shadowStyle, pulseGlow && badge.earned && {
      shadowRadius: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 22] }),
      shadowOpacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0.8] }),
    }]}>
      <Svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <RadialGradient id={`bg${uid}`} cx="38%" cy="28%" r="72%">
            <Stop offset="0%" stopColor={badge.earned ? badge.color + 'cc' : '#2a2520'}/>
            <Stop offset="55%" stopColor={badge.earned ? badge.color + '99' : '#1a1714'}/>
            <Stop offset="100%" stopColor={badge.earned ? badge.color + '44' : '#110f0d'}/>
          </RadialGradient>
          <LinearGradient id={`bevel${uid}`} x1="0%" y1="0%" x2="80%" y2="100%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0.35)"/>
            <Stop offset="45%" stopColor="rgba(255,255,255,0.05)"/>
            <Stop offset="100%" stopColor="rgba(0,0,0,0.3)"/>
          </LinearGradient>
          <LinearGradient id={`sheen${uid}`} x1="20%" y1="0%" x2="80%" y2="100%">
            <Stop offset="0%" stopColor="rgba(255,255,255,0.18)"/>
            <Stop offset="40%" stopColor="rgba(255,255,255,0.04)"/>
            <Stop offset="100%" stopColor="rgba(0,0,0,0.15)"/>
          </LinearGradient>
          <ClipPath id={`cl${uid}`}>
            <Polygon points={poly}/>
          </ClipPath>
        </Defs>

        {/* Outer glow ring */}
        {badge.earned && (
          <Polygon
            points={pts.map(p => `${p.x + (p.x - cx) * 0.06},${p.y + (p.y - cy) * 0.06}`).join(' ')}
            fill="none"
            stroke={badge.color}
            strokeWidth="3"
            opacity="0.25"
          />
        )}

        {/* Main body */}
        <Polygon points={poly} fill={`url(#bg${uid})`}/>

        {/* Bevel */}
        <Polygon points={poly} fill={`url(#bevel${uid})`} clipPath={`url(#cl${uid})`} opacity={badge.earned ? 0.7 : 0.3}/>

        {/* Metallic sheen */}
        <Polygon points={poly} fill={`url(#sheen${uid})`} clipPath={`url(#cl${uid})`}/>

        {/* Inner ring */}
        <Polygon points={innerPoly} fill="none" stroke={badge.earned ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)'} strokeWidth="1"/>

        {/* Corner notches (earned) */}
        {badge.earned && pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={1.5 * (size / 100)} fill={badge.color} opacity="0.6"/>
        ))}

        {/* Icon */}
        <G clipPath={`url(#cl${uid})`}>
          <G transform={`translate(${ix},${iy}) scale(${iconScale})`} opacity={badge.earned ? 1 : 0.22}>
            <Svg width="40" height="40" viewBox="0 0 40 40">
              <IconComponent/>
            </Svg>
          </G>
        </G>

        {/* Lock overlay */}
        {!badge.earned && (
          <G transform={`translate(${cx - 8 * (size / 100)},${cy - 10 * (size / 100)})`} opacity="0.3">
            <Rect x={3 * (size / 100)} y={7 * (size / 100)} width={10 * (size / 100)} height={9 * (size / 100)} rx={2 * (size / 100)} stroke="white" strokeWidth="1.5" fill="none"/>
            <Path d={`M${5 * (size / 100)} ${7 * (size / 100)}V${5 * (size / 100)}Q${5 * (size / 100)} ${1 * (size / 100)} ${8 * (size / 100)} ${1 * (size / 100)}Q${11 * (size / 100)} ${1 * (size / 100)} ${11 * (size / 100)} ${5 * (size / 100)}V${7 * (size / 100)}`} stroke="white" strokeWidth="1.5" fill="none"/>
            <Circle cx={8 * (size / 100)} cy={12 * (size / 100)} r={1.5 * (size / 100)} fill="white"/>
          </G>
        )}

        {/* Outer frame stroke */}
        <Polygon points={poly} fill="none" stroke={badge.earned ? badge.color : 'rgba(255,255,255,0.08)'} strokeWidth={badge.earned ? 1.5 : 0.8}/>
      </Svg>
    </Animated.View>
  );
}
