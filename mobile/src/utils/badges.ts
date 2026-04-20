/**
 * Badge Engine — computes earned badges from a player's catch history.
 *
 * All logic runs client-side from local CatchRecord data. Works fully offline.
 * Add new badges by appending to BADGE_DEFS — no other changes needed.
 */

import type { CatchRecord } from '@/stores/catchStore';

export type Badge = {
  id: string;
  name: string;
  description: string;
  category: 'enthusiast' | 'collection' | 'rarity' | 'decade' | 'style' | 'grind' | 'social';
  icon: string;                 // emoji
  color: string;                // accent color for the badge card
  earned: boolean;
  progress?: { current: number; total: number };
};

type BadgeDef = Omit<Badge, 'earned' | 'progress'> & {
  check: (catches: CatchRecord[]) => boolean;
  trackProgress?: (catches: CatchRecord[]) => { current: number; total: number };
};

// ─── Additional helpers ──────────────────────────────────────────────────────

function catchCount(n: number) {
  return (catches: CatchRecord[]) => catches.length >= n;
}

function catchCountProgress(n: number) {
  return (catches: CatchRecord[]) => ({ current: Math.min(catches.length, n), total: n });
}

function hasCatchType(type: CatchRecord['catchType']) {
  return (catches: CatchRecord[]) => catches.some(c => c.catchType === type);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function byMake(make: string) {
  return (c: CatchRecord) => c.make.toLowerCase() === make.toLowerCase();
}

function byMakes(makes: string[]) {
  const set = new Set(makes.map(m => m.toLowerCase()));
  return (c: CatchRecord) => set.has(c.make.toLowerCase());
}

function hasModel(make: string, model: string) {
  return (catches: CatchRecord[]) =>
    catches.some(c =>
      c.make.toLowerCase() === make.toLowerCase() &&
      c.model.toLowerCase().includes(model.toLowerCase()),
    );
}

function distinctModels(predicate: (c: CatchRecord) => boolean) {
  return (catches: CatchRecord[]) =>
    new Set(catches.filter(predicate).map(c => `${c.make}|${c.model}`)).size;
}

function hasMakes(makes: string[]) {
  return (catches: CatchRecord[]) => {
    const caught = new Set(catches.map(c => c.make.toLowerCase()));
    return makes.every(m => caught.has(m.toLowerCase()));
  };
}

/** Extract the start year from a generation string like "XW50 (2019–present)" */
function genYear(generation: string): number | null {
  const m = generation.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

function hasBodyStyles(styles: string[]) {
  const set = new Set(styles.map(s => s.toLowerCase()));
  return (catches: CatchRecord[]) => {
    const caught = new Set(catches.map(c => c.bodyStyle.toLowerCase()));
    return [...set].every(s => caught.has(s));
  };
}

// ─── Badge Definitions ───────────────────────────────────────────────────────

const BADGE_DEFS: BadgeDef[] = [

  // ── Enthusiast / Make ────────────────────────────────────────────────────

  {
    id: 'blue_oval',
    name: 'Blue Oval',
    description: 'Catch 5 different Ford models.',
    category: 'enthusiast',
    icon: 'globe',
    color: '#003478',
    check: c => distinctModels(byMake('Ford'))(c) >= 5,
    trackProgress: c => ({ current: Math.min(distinctModels(byMake('Ford'))(c), 5), total: 5 }),
  },
  {
    id: 'stang_gang',
    name: 'Stang Gang',
    description: 'Catch a Ford Mustang.',
    category: 'enthusiast',
    icon: 'horse',
    color: '#c8102e',
    check: hasModel('Ford', 'Mustang'),
  },
  {
    id: 'bronco_nation',
    name: 'Bronco Nation',
    description: 'Catch a Ford Bronco.',
    category: 'enthusiast',
    icon: 'mountain',
    color: '#007bff',
    check: hasModel('Ford', 'Bronco'),
  },
  {
    id: 'jeep_life',
    name: 'Jeep Life',
    description: 'Catch 3+ Jeeps.',
    category: 'enthusiast',
    icon: 'mountain',
    color: '#4a7c59',
    check: c => c.filter(byMake('Jeep')).length >= 3,
    trackProgress: c => ({ current: Math.min(c.filter(byMake('Jeep')).length, 3), total: 3 }),
  },
  {
    id: 'trail_rated',
    name: 'Trail Rated',
    description: 'Catch both a Wrangler and a Gladiator.',
    category: 'enthusiast',
    icon: 'mountain',
    color: '#2e7d32',
    check: c => hasModel('Jeep', 'Wrangler')(c) && hasModel('Jeep', 'Gladiator')(c),
  },
  {
    id: 'toyota_nation',
    name: 'Toyota Nation',
    description: 'Catch 5 different Toyota models.',
    category: 'enthusiast',
    icon: 'sun_rays',
    color: '#eb0a1e',
    check: c => distinctModels(byMake('Toyota'))(c) >= 5,
    trackProgress: c => ({ current: Math.min(distinctModels(byMake('Toyota'))(c), 5), total: 5 }),
  },
  {
    id: 'supra_club',
    name: 'Supra Club',
    description: 'Catch a Toyota GR Supra.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#e50000',
    check: hasModel('Toyota', 'Supra'),
  },
  {
    id: 'tacoma_bro',
    name: 'Tacoma Bro',
    description: 'Catch a Toyota Tacoma.',
    category: 'enthusiast',
    icon: 'car_truck',
    color: '#b71c1c',
    check: hasModel('Toyota', 'Tacoma'),
  },
  {
    id: 'four_runner_faithful',
    name: '4Runner Faithful',
    description: 'Catch a Toyota 4Runner.',
    category: 'enthusiast',
    icon: 'car_suv',
    color: '#827717',
    check: hasModel('Toyota', '4Runner'),
  },
  {
    id: 'bow_tie',
    name: 'Bow Tie',
    description: 'Catch 5 different Chevrolet models.',
    category: 'enthusiast',
    icon: 'globe',
    color: '#d4a017',
    check: c => distinctModels(byMake('Chevrolet'))(c) >= 5,
    trackProgress: c => ({ current: Math.min(distinctModels(byMake('Chevrolet'))(c), 5), total: 5 }),
  },
  {
    id: 'vette_owner',
    name: 'Vette Owner',
    description: 'Catch a Chevrolet Corvette.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#f57f17',
    check: hasModel('Chevrolet', 'Corvette'),
  },
  {
    id: 'america_first',
    name: 'America First',
    description: 'Catch a Ford, Chevy, Ram, and GMC.',
    category: 'enthusiast',
    icon: 'flag_us',
    color: '#b22234',
    check: hasMakes(['Ford', 'Chevrolet', 'Ram', 'GMC']),
  },
  {
    id: 'german_precision',
    name: 'German Precision',
    description: 'Catch a BMW, Mercedes-Benz, Audi, and Porsche.',
    category: 'enthusiast',
    icon: 'shield',
    color: '#000000',
    check: hasMakes(['BMW', 'Mercedes-Benz', 'Audi', 'Porsche']),
  },
  {
    id: 'stuttgart_spec',
    name: 'Stuttgart Spec',
    description: 'Catch a Porsche 911.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#8b0000',
    check: hasModel('Porsche', '911'),
  },
  {
    id: 'prancing_horse',
    name: 'Prancing Horse',
    description: 'Catch a Ferrari.',
    category: 'enthusiast',
    icon: 'horse',
    color: '#cc0000',
    check: c => c.some(byMake('Ferrari')),
  },
  {
    id: 'raging_bull',
    name: 'Raging Bull',
    description: 'Catch a Lamborghini.',
    category: 'enthusiast',
    icon: 'bull_horns',
    color: '#ffd700',
    check: c => c.some(byMake('Lamborghini')),
  },
  {
    id: 'rising_sun',
    name: 'Rising Sun',
    description: 'Catch 5+ Japanese brand vehicles.',
    category: 'enthusiast',
    icon: 'sun_rays',
    color: '#bc002d',
    check: c => c.filter(byMakes(['Toyota', 'Honda', 'Nissan', 'Mazda', 'Subaru', 'Lexus', 'Acura', 'Infiniti', 'Mitsubishi'])).length >= 5,
    trackProgress: c => ({
      current: Math.min(c.filter(byMakes(['Toyota', 'Honda', 'Nissan', 'Mazda', 'Subaru', 'Lexus', 'Acura', 'Infiniti', 'Mitsubishi'])).length, 5),
      total: 5,
    }),
  },
  {
    id: 'korean_wave',
    name: 'Korean Wave',
    description: 'Catch a Hyundai, Kia, and Genesis.',
    category: 'enthusiast',
    icon: 'sun_rays',
    color: '#003478',
    check: hasMakes(['Hyundai', 'Kia', 'Genesis']),
  },
  {
    id: 'wrx_club',
    name: 'WRX Club',
    description: 'Catch a Subaru WRX.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#1565c0',
    check: hasModel('Subaru', 'WRX'),
  },
  {
    id: 'gt_r_spotter',
    name: 'GT-R Spotter',
    description: 'Catch a Nissan GT-R. Godzilla walks among us.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#880e4f',
    check: hasModel('Nissan', 'GT-R'),
  },
  {
    id: 'tesla_fleet',
    name: 'Tesla Fleet',
    description: 'Catch 3 different Tesla models.',
    category: 'enthusiast',
    icon: 'lightning',
    color: '#cc0000',
    check: c => distinctModels(byMake('Tesla'))(c) >= 3,
    trackProgress: c => ({ current: Math.min(distinctModels(byMake('Tesla'))(c), 3), total: 3 }),
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Catch a Tesla Cybertruck.',
    category: 'enthusiast',
    icon: 'robot',
    color: '#607d8b',
    check: hasModel('Tesla', 'Cybertruck'),
  },
  {
    id: 'miata_is_always_the_answer',
    name: 'Miata Is Always the Answer',
    description: 'Catch a Mazda MX-5 Miata.',
    category: 'enthusiast',
    icon: 'car_drop',
    color: '#e53935',
    check: hasModel('Mazda', 'MX-5'),
  },

  // ── Style ────────────────────────────────────────────────────────────────

  {
    id: 'truck_life',
    name: 'Truck Life',
    description: 'Catch 5+ trucks.',
    category: 'style',
    icon: 'car_truck',
    color: '#5d4037',
    check: c => c.filter(x => x.bodyStyle.toLowerCase() === 'truck').length >= 5,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.bodyStyle.toLowerCase() === 'truck').length, 5),
      total: 5,
    }),
  },
  {
    id: 'coupe_de_grace',
    name: 'Coupé de Grâce',
    description: 'Catch 5+ coupes.',
    category: 'style',
    icon: 'car_coupe',
    color: '#4a148c',
    check: c => c.filter(x => x.bodyStyle.toLowerCase() === 'coupe').length >= 5,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.bodyStyle.toLowerCase() === 'coupe').length, 5),
      total: 5,
    }),
  },
  {
    id: 'body_builder',
    name: 'Body Builder',
    description: 'Catch all 6 body styles.',
    category: 'style',
    icon: 'globe',
    color: '#00695c',
    check: hasBodyStyles(['Sedan', 'SUV', 'Truck', 'Coupe', 'Hatchback', 'Convertible']),
    trackProgress: c => {
      const styles = ['sedan', 'suv', 'truck', 'coupe', 'hatchback', 'convertible'];
      const caught = new Set(c.map(x => x.bodyStyle.toLowerCase()));
      return { current: styles.filter(s => caught.has(s)).length, total: 6 };
    },
  },
  {
    id: 'drop_top',
    name: 'Drop Top',
    description: 'Catch a convertible.',
    category: 'style',
    icon: 'car_drop',
    color: '#e65100',
    check: c => c.some(x => x.bodyStyle.toLowerCase() === 'convertible'),
  },

  // ── Rarity ───────────────────────────────────────────────────────────────

  {
    id: 'first_catch',
    name: 'First Catch',
    description: 'Catch your first vehicle.',
    category: 'rarity',
    icon: 'hook',
    color: '#455a64',
    check: c => c.length >= 1,
  },
  {
    id: 'road_scholar',
    name: 'Road Scholar',
    description: 'Catch 25 vehicles.',
    category: 'rarity',
    icon: 'book',
    color: '#37474f',
    check: c => c.length >= 25,
    trackProgress: c => ({ current: Math.min(c.length, 25), total: 25 }),
  },
  {
    id: 'garage_king',
    name: 'Garage King',
    description: 'Catch 50 vehicles.',
    category: 'rarity',
    icon: 'crown',
    color: '#f57f17',
    check: c => c.length >= 50,
    trackProgress: c => ({ current: Math.min(c.length, 50), total: 50 }),
  },
  {
    id: 'rare_find',
    name: 'Rare Find',
    description: 'Catch a rare or better vehicle.',
    category: 'rarity',
    icon: 'gem',
    color: '#6a1b9a',
    check: c => c.some(x => x.rarity && ['rare', 'epic', 'legendary'].includes(x.rarity)),
  },
  {
    id: 'epic_taste',
    name: 'Epic Taste',
    description: 'Catch 3 epic vehicles.',
    category: 'rarity',
    icon: 'starburst',
    color: '#f59e0b',
    check: c => c.filter(x => x.rarity === 'epic').length >= 3,
    trackProgress: c => ({ current: Math.min(c.filter(x => x.rarity === 'epic').length, 3), total: 3 }),
  },
  {
    id: 'legend_seeker',
    name: 'Legend Seeker',
    description: 'Catch a legendary vehicle.',
    category: 'rarity',
    icon: 'starburst',
    color: '#e63946',
    check: c => c.some(x => x.rarity === 'legendary'),
  },
  {
    id: 'full_spectrum',
    name: 'Full Spectrum',
    description: 'Catch one of each rarity tier.',
    category: 'rarity',
    icon: 'gem',
    color: '#00897b',
    check: c => {
      const tiers = new Set(c.map(x => x.rarity).filter(Boolean));
      return ['common', 'uncommon', 'rare', 'epic', 'legendary'].every(t => tiers.has(t));
    },
    trackProgress: c => {
      const tiers = new Set(c.map(x => x.rarity).filter(Boolean));
      return { current: ['common', 'uncommon', 'rare', 'epic', 'legendary'].filter(t => tiers.has(t)).length, total: 5 };
    },
  },

  // ── Decade ───────────────────────────────────────────────────────────────

  {
    id: 'classic_eye',
    name: 'Classic Eye',
    description: 'Catch a vehicle from a pre-2000 generation.',
    category: 'decade',
    icon: 'clock',
    color: '#795548',
    check: c => c.some(x => {
      const y = genYear(x.generation);
      return y !== null && y < 2000;
    }),
  },
  {
    id: 'aughts_kid',
    name: 'Aughts Kid',
    description: 'Catch a 2000–2009 generation vehicle.',
    category: 'decade',
    icon: 'clock',
    color: '#5c6bc0',
    check: c => c.some(x => {
      const y = genYear(x.generation);
      return y !== null && y >= 2000 && y <= 2009;
    }),
  },
  {
    id: 'tens_collector',
    name: "2010s Collector",
    description: 'Catch a 2010–2019 generation vehicle.',
    category: 'decade',
    icon: 'clock',
    color: '#26a69a',
    check: c => c.some(x => {
      const y = genYear(x.generation);
      return y !== null && y >= 2010 && y <= 2019;
    }),
  },
  {
    id: 'new_decade',
    name: 'New Decade',
    description: 'Catch a 2020+ generation vehicle.',
    category: 'decade',
    icon: 'rocket',
    color: '#1565c0',
    check: c => c.some(x => {
      const y = genYear(x.generation);
      return y !== null && y >= 2020;
    }),
  },

  // ── Decade expansion ─────────────────────────────────────────────────────

  {
    id: 'muscle_era',
    name: 'Muscle Era',
    description: 'Catch a vehicle from a 1960s or 1970s generation.',
    category: 'decade',
    icon: 'car_muscle',
    color: '#bf360c',
    check: c => c.some(x => {
      const y = genYear(x.generation);
      return y !== null && y >= 1960 && y <= 1979;
    }),
  },
  {
    id: 'malaise_survivor',
    name: 'Malaise Era Survivor',
    description: 'Catch a vehicle from a 1975–1982 generation.',
    category: 'decade',
    icon: 'clock',
    color: '#6d4c41',
    check: c => c.some(x => {
      const y = genYear(x.generation);
      return y !== null && y >= 1975 && y <= 1982;
    }),
  },

  // ── Grind tier ───────────────────────────────────────────────────────────

  {
    id: 'ten_deep',
    name: 'Ten Deep',
    description: 'Catch 10 vehicles.',
    category: 'grind',
    icon: 'trophy',
    color: '#37474f',
    check: catchCount(10),
    trackProgress: catchCountProgress(10),
  },
  {
    id: 'century_club',
    name: 'Century Club',
    description: 'Catch 100 vehicles.',
    category: 'grind',
    icon: 'trophy',
    color: '#f57f17',
    check: catchCount(100),
    trackProgress: catchCountProgress(100),
  },
  {
    id: 'road_warrior',
    name: 'Road Warrior',
    description: 'Catch 500 vehicles. True prestige.',
    category: 'grind',
    icon: 'speedometer',
    color: '#b71c1c',
    check: catchCount(500),
    trackProgress: catchCountProgress(500),
  },
  {
    id: 'import_tuner',
    name: 'Import Tuner',
    description: 'Catch a WRX, Civic Type R, Golf GTI, and GR86.',
    category: 'grind',
    icon: 'wrench',
    color: '#1a237e',
    check: c =>
      hasModel('Subaru', 'WRX')(c) &&
      hasModel('Honda', 'Civic')(c) &&
      hasModel('Volkswagen', 'Golf')(c) &&
      hasModel('Toyota', 'GR86')(c),
  },
  {
    id: 'domestic_muscle',
    name: 'Domestic Muscle',
    description: 'Catch a Mustang, Challenger, Charger, and Corvette.',
    category: 'grind',
    icon: 'fist',
    color: '#c62828',
    check: c =>
      hasModel('Ford', 'Mustang')(c) &&
      hasModel('Dodge', 'Challenger')(c) &&
      hasModel('Dodge', 'Charger')(c) &&
      hasModel('Chevrolet', 'Corvette')(c),
  },
  {
    id: 'holy_trinity',
    name: 'Holy Trinity',
    description: 'Catch a Porsche 911, a Ferrari, and a Lamborghini.',
    category: 'grind',
    icon: 'crown',
    color: '#880e4f',
    check: c =>
      hasModel('Porsche', '911')(c) &&
      c.some(byMake('Ferrari')) &&
      c.some(byMake('Lamborghini')),
  },
  {
    id: 'all_american_sweep',
    name: 'All-American Sweep',
    description: 'Catch vehicles from all 5 domestic brands: Ford, Chevy, Ram, GMC, and Dodge.',
    category: 'grind',
    icon: 'flag_us',
    color: '#b22234',
    check: hasMakes(['Ford', 'Chevrolet', 'Ram', 'GMC', 'Dodge']),
  },
  {
    id: 'unplugged',
    name: 'Unplugged',
    description: 'Catch all 5 Tesla models: Model 3, Y, S, X, and Cybertruck.',
    category: 'grind',
    icon: 'lightning',
    color: '#cc0000',
    check: c =>
      hasModel('Tesla', 'Model 3')(c) &&
      hasModel('Tesla', 'Model Y')(c) &&
      hasModel('Tesla', 'Model S')(c) &&
      hasModel('Tesla', 'Model X')(c) &&
      hasModel('Tesla', 'Cybertruck')(c),
    trackProgress: c => {
      const models = ['Model 3', 'Model Y', 'Model S', 'Model X', 'Cybertruck'];
      const caught = models.filter(m => hasModel('Tesla', m)(c));
      return { current: caught.length, total: 5 };
    },
  },

  // ── Enthusiast deep-cuts ──────────────────────────────────────────────────

  {
    id: 'g_wagon_gang',
    name: 'G-Wagon Gang',
    description: 'Catch a Mercedes-Benz G-Class.',
    category: 'enthusiast',
    icon: 'car_suv',
    color: '#263238',
    check: hasModel('Mercedes-Benz', 'G-Class'),
  },
  {
    id: 'blackwing_brotherhood',
    name: 'Blackwing Brotherhood',
    description: 'Catch a Cadillac CT5-V Blackwing.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#1a1a2e',
    check: hasModel('Cadillac', 'CT5'),
  },
  {
    id: 'nsx_spotter',
    name: 'NSX Spotter',
    description: 'Catch an Acura NSX. Last of its kind.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#c62828',
    check: hasModel('Acura', 'NSX'),
  },
  {
    id: 'godzilla_returns',
    name: 'Godzilla Returns',
    description: 'Catch a Nissan GT-R, a 370Z, and a 400Z.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#880e4f',
    check: c =>
      hasModel('Nissan', 'GT-R')(c) &&
      (hasModel('Nissan', '370Z')(c) || hasModel('Nissan', '400Z')(c)),
  },
  {
    id: 'hachi_roku',
    name: 'Hachi-Roku',
    description: 'Catch a Toyota GR86 or Subaru BRZ.',
    category: 'enthusiast',
    icon: 'car_coupe',
    color: '#c62828',
    check: c => hasModel('Toyota', 'GR86')(c) || hasModel('Subaru', 'BRZ')(c),
  },
  {
    id: 'land_cruiser_legacy',
    name: 'Land Cruiser Legacy',
    description: 'Catch a Toyota Land Cruiser.',
    category: 'enthusiast',
    icon: 'car_suv',
    color: '#795548',
    check: hasModel('Toyota', 'Land Cruiser'),
  },
  {
    id: 'hellcat_heard',
    name: 'Hellcat Heard',
    description: 'Catch a Dodge Charger or Challenger Hellcat variant.',
    category: 'enthusiast',
    icon: 'car_muscle',
    color: '#ff6f00',
    check: c =>
      hasModel('Dodge', 'Charger')(c) || hasModel('Dodge', 'Challenger')(c),
  },
  {
    id: 'amg_spotter',
    name: 'AMG Spotter',
    description: 'Catch a Mercedes-AMG model.',
    category: 'enthusiast',
    icon: 'shield',
    color: '#1b1b1b',
    check: hasModel('Mercedes-Benz', 'AMG'),
  },
  {
    id: 'm_badge',
    name: 'M Badge',
    description: 'Catch a BMW M-series vehicle.',
    category: 'enthusiast',
    icon: 'shield',
    color: '#0d47a1',
    check: hasModel('BMW', 'M'),
  },
  {
    id: 'rs_spec',
    name: 'RS Spec',
    description: 'Catch an Audi RS model.',
    category: 'enthusiast',
    icon: 'shield',
    color: '#c62828',
    check: hasModel('Audi', 'RS'),
  },
  {
    id: 'srt_certified',
    name: 'SRT Certified',
    description: 'Catch a Dodge SRT model.',
    category: 'enthusiast',
    icon: 'car_muscle',
    color: '#ff6f00',
    check: hasModel('Dodge', 'SRT'),
  },
  {
    id: 'raptor_sighting',
    name: 'Raptor Sighting',
    description: 'Catch a Ford F-150 Raptor.',
    category: 'enthusiast',
    icon: 'car_truck',
    color: '#1565c0',
    check: hasModel('Ford', 'Raptor'),
  },

  // ── Style expansion ───────────────────────────────────────────────────────

  {
    id: 'van_life',
    name: 'Van Life',
    description: 'Catch 3+ vans or minivans.',
    category: 'style',
    icon: 'car_van',
    color: '#4a148c',
    check: c => c.filter(x => x.bodyStyle.toLowerCase().includes('van')).length >= 3,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.bodyStyle.toLowerCase().includes('van')).length, 3),
      total: 3,
    }),
  },
  {
    id: 'hatch_nation',
    name: 'Hatch Nation',
    description: 'Catch 5+ hatchbacks.',
    category: 'style',
    icon: 'car_hatch',
    color: '#00695c',
    check: c => c.filter(x => x.bodyStyle.toLowerCase() === 'hatchback').length >= 5,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.bodyStyle.toLowerCase() === 'hatchback').length, 5),
      total: 5,
    }),
  },
  {
    id: 'sedan_society',
    name: 'Sedan Society',
    description: 'Catch 10+ sedans.',
    category: 'style',
    icon: 'car_coupe',
    color: '#263238',
    check: c => c.filter(x => x.bodyStyle.toLowerCase() === 'sedan').length >= 10,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.bodyStyle.toLowerCase() === 'sedan').length, 10),
      total: 10,
    }),
  },
  {
    id: 'suv_nation',
    name: 'SUV Nation',
    description: 'Catch 10+ SUVs.',
    category: 'style',
    icon: 'car_suv',
    color: '#37474f',
    check: c => c.filter(x => x.bodyStyle.toLowerCase() === 'suv').length >= 10,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.bodyStyle.toLowerCase() === 'suv').length, 10),
      total: 10,
    }),
  },

  // ── Social badges (requires backend data) ────────────────────────────────

  {
    id: 'space_catcher',
    name: 'Space Catcher',
    description: 'Catch your first space object.',
    category: 'social',
    icon: 'satellite',
    color: '#1a237e',
    check: hasCatchType('space'),
  },
  {
    id: 'ground_control',
    name: 'Ground Control',
    description: 'Catch 5 space objects.',
    category: 'social',
    icon: 'satellite',
    color: '#0d47a1',
    check: c => c.filter(x => x.catchType === 'space').length >= 5,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.catchType === 'space').length, 5),
      total: 5,
    }),
  },
  {
    id: 'scanner_pro',
    name: 'Scanner Pro',
    description: 'Complete 10 full 360° scans.',
    category: 'social',
    icon: 'arrows_360',
    color: '#1b5e20',
    check: c => c.filter(x => x.catchType === 'scan360').length >= 10,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.catchType === 'scan360').length, 10),
      total: 10,
    }),
  },
  {
    id: 'highway_hunter',
    name: 'Highway Hunter',
    description: 'Record 50 Dash Sentry catches.',
    category: 'social',
    icon: 'speedometer',
    color: '#b71c1c',
    check: c => c.filter(x => x.catchType === 'highway').length >= 50,
    trackProgress: c => ({
      current: Math.min(c.filter(x => x.catchType === 'highway').length, 50),
      total: 50,
    }),
  },
  {
    id: 'community_helper',
    name: 'Community Helper',
    description: 'Submit a vehicle to the unknown queue.',
    category: 'social',
    icon: 'globe',
    color: '#00695c',
    check: c => c.some(x => x.catchType === 'unknown'),
  },

  // ── Rarity expansion ──────────────────────────────────────────────────────

  {
    id: 'double_rare',
    name: 'Double Rare',
    description: 'Catch 5 rare vehicles.',
    category: 'rarity',
    icon: 'gem',
    color: '#6a1b9a',
    check: c => c.filter(x => x.rarity === 'rare').length >= 5,
    trackProgress: c => ({ current: Math.min(c.filter(x => x.rarity === 'rare').length, 5), total: 5 }),
  },
  {
    id: 'epic_collection',
    name: 'Epic Collection',
    description: 'Catch 10 epic vehicles.',
    category: 'rarity',
    icon: 'starburst',
    color: '#e65100',
    check: c => c.filter(x => x.rarity === 'epic').length >= 10,
    trackProgress: c => ({ current: Math.min(c.filter(x => x.rarity === 'epic').length, 10), total: 10 }),
  },
  {
    id: 'legendary_status',
    name: 'Legendary Status',
    description: 'Catch 3 legendary vehicles.',
    category: 'rarity',
    icon: 'crown',
    color: '#e63946',
    check: c => c.filter(x => x.rarity === 'legendary').length >= 3,
    trackProgress: c => ({ current: Math.min(c.filter(x => x.rarity === 'legendary').length, 3), total: 3 }),
  },
];

// ─── Public API ──────────────────────────────────────────────────────────────

/** Compute all badges, marking each as earned/not-earned with optional progress. */
export function computeBadges(catches: CatchRecord[]): Badge[] {
  return BADGE_DEFS.map(def => ({
    id:          def.id,
    name:        def.name,
    description: def.description,
    category:    def.category,
    icon:        def.icon,
    color:       def.color,
    earned:      def.check(catches),
    progress:    def.trackProgress?.(catches),
  }));
}

/** Subset of badges that have been earned. */
export function earnedBadges(catches: CatchRecord[]): Badge[] {
  return computeBadges(catches).filter(b => b.earned);
}

/** Look up a badge definition by id (useful for award modals from API responses). */
export function getBadgeById(id: string): Badge | undefined {
  const def = BADGE_DEFS.find(d => d.id === id);
  if (!def) return undefined;
  return {
    id:          def.id,
    name:        def.name,
    description: def.description,
    category:    def.category,
    icon:        def.icon,
    color:       def.color,
    earned:      true,
  };
}

export const BADGE_CATEGORIES = ['enthusiast', 'grind', 'rarity', 'style', 'decade', 'social', 'collection'] as const;
export type BadgeCategory = typeof BADGE_CATEGORIES[number];
