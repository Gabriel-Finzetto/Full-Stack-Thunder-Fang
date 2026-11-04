import type { Messages } from './config';
import { commonMessages } from './common-messages';
import { catalogMessages } from './catalog-messages';
import { accountMessages } from './account-messages';
import { checkoutMessages } from './checkout-messages';
import { contactMessages } from './contact-messages';
import { experienceMessages } from './experience-messages';
import { dataUxMessages } from './data-ux-messages';
import { checkoutUxMessages } from './checkout-ux-messages';
import { navigationUxMessages } from './navigation-ux-messages';
import { navigationPolishMessages } from './navigation-polish-messages';
import { purchasePolishMessages } from './purchase-polish-messages';
import { catalogPolishMessages } from './catalog-polish-messages';
import { cartPolishMessages } from './cart-polish-messages';
import { helpCenterMessages } from './help-center-messages';
import { accountUpdatesMessages } from './account-updates-messages';
import { storeUpdatesMessages } from './store-updates-messages';

export const messages: Messages = {
  ...commonMessages, ...catalogMessages, ...accountMessages, ...checkoutMessages, ...contactMessages,
  ...experienceMessages, ...dataUxMessages, ...checkoutUxMessages, ...navigationUxMessages,
  ...navigationPolishMessages, ...purchasePolishMessages, ...catalogPolishMessages, ...cartPolishMessages, ...helpCenterMessages,
  ...accountUpdatesMessages, ...storeUpdatesMessages,
};
