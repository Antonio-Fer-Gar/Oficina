import { z } from 'zod';

export const BREEDS = {
  shepherd: 'Pastor alemán', golden: 'Golden retriever', labrador: 'Labrador', husky: 'Husky siberiano',
  beagle: 'Beagle', frenchie: 'Bulldog francés', dalmatian: 'Dálmata', dachshund: 'Perro salchicha',
} as const;
export const OUTFITS = {
  shirt: 'Camisa nter', polo: 'Polo blanco', jacket: 'Chaqueta verde', suit: 'Traje y corbata',
  hoodie: 'Sudadera', stripes: 'Camiseta de rayas', labcoat: 'Bata de laboratorio',
} as const;
export const ROBOT_COLORS = {
  blue: 'Azul', orange: 'Naranja', mint: 'Menta', pink: 'Rosa', purple: 'Morado', cream: 'Crema',
} as const;
export const HUMAN_GENDERS = { man: 'Hombre', woman: 'Mujer' } as const;
export const HUMAN_SKINS = { light: 'Clara', medium: 'Media', dark: 'Oscura' } as const;
export const HUMAN_HAIR_COLORS = { brown: 'Castaño', black: 'Negro', blond: 'Rubio', gray: 'Canoso' } as const;
export const HUMAN_HAIR_STYLES = { short: 'Corto', long: 'Largo', bald: 'Sin pelo' } as const;
export const DEFAULT_ROBOT_COLORS = { agent: 'blue', subagent: 'orange' } as const;
export const DEFAULT_HUMAN = { skin: 'medium', hair: 'brown', style: 'short', gender: 'man' } as const;
export type Breed = keyof typeof BREEDS;
export type Outfit = keyof typeof OUTFITS;
export type RobotColor = keyof typeof ROBOT_COLORS;
export type HumanSkin = keyof typeof HUMAN_SKINS;
export type HumanHairColor = keyof typeof HUMAN_HAIR_COLORS;
export type HumanHairStyle = keyof typeof HUMAN_HAIR_STYLES;
export type HumanGender = keyof typeof HUMAN_GENDERS;
const BreedSchema = z.enum(Object.keys(BREEDS) as [Breed, ...Breed[]]);
const OutfitSchema = z.enum(Object.keys(OUTFITS) as [Outfit, ...Outfit[]]);
const ThemeSchema = z.enum(['animals', 'robots']);
const RobotColorSchema = z.enum(Object.keys(ROBOT_COLORS) as [RobotColor, ...RobotColor[]]);
const HumanSkinSchema = z.enum(Object.keys(HUMAN_SKINS) as [HumanSkin, ...HumanSkin[]]);
const HumanHairColorSchema = z.enum(Object.keys(HUMAN_HAIR_COLORS) as [HumanHairColor, ...HumanHairColor[]]);
const HumanHairStyleSchema = z.enum(Object.keys(HUMAN_HAIR_STYLES) as [HumanHairStyle, ...HumanHairStyle[]]);
const HumanGenderSchema = z.enum(Object.keys(HUMAN_GENDERS) as [HumanGender, ...HumanGender[]]);
export const AppearanceSchema = z.object({
  theme: ThemeSchema.default('robots'),
  breed: BreedSchema,
  outfits: z.object({ dog: OutfitSchema, cat: OutfitSchema, mouse: OutfitSchema }),
  robotColors: z.object({ agent: RobotColorSchema, subagent: RobotColorSchema }).default(DEFAULT_ROBOT_COLORS),
  human: z.object({
    skin: HumanSkinSchema, hair: HumanHairColorSchema, style: HumanHairStyleSchema,
    gender: HumanGenderSchema.default(DEFAULT_HUMAN.gender),
  }).default(DEFAULT_HUMAN),
});
export type Appearance = z.input<typeof AppearanceSchema>;
/** What the office looked like before the user could choose. */
export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'robots', breed: 'shepherd', outfits: { dog: 'jacket', cat: 'shirt', mouse: 'polo' },
  robotColors: DEFAULT_ROBOT_COLORS, human: DEFAULT_HUMAN,
};
