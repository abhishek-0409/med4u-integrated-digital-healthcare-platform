import { User } from '../../database/entities/user.entity';

type ProfileFields = Pick<User, 'phone' | 'name' | 'email' | 'dob' | 'gender' | 'bloodGroup'>;

/**
 * Single source of truth for "has this account finished onboarding?".
 *
 * Required: a real name (new accounts get their phone number as a placeholder), email, date of
 * birth, gender and blood group. Height and weight are optional and never block completion.
 */
export function isProfileComplete(user: ProfileFields): boolean {
  const name = user.name?.trim();
  return Boolean(
    name &&
      name !== user.phone &&
      user.email &&
      user.dob &&
      user.gender &&
      user.bloodGroup,
  );
}
