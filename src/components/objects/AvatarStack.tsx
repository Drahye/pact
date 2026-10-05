import { AvatarGroup } from '../ui/AvatarGroup';

/**
 * Overlapping faces: who is in, who answered, who paid. The ring colour matches the surface they sit on (`ring`), a `+N` closes the
 * stack, and `enter` brings the faces in one after another, once. The stack is one labelled group for a screen reader ("5 people").
 */
export const AvatarStack = AvatarGroup;
