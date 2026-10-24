// Items that go in the bag. `icon` is the name of a picture made in art.js.

const ITEMS = {
  potion: {
    name: 'Healing Potion',
    icon: 'potion',
    description: 'Restores ' + CONFIG.potion.heal + ' health.',
    usable: true,
  },
  pendant: {
    name: "Mira's Pendant",
    icon: 'pendant',
    description: 'Silver, with a blue stone. Return it to Mira.',
    usable: false,
  },
};
