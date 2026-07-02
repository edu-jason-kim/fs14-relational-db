import * as s from "superstruct";
import isEmail from "is-email";

const CATEGORIES = [
  "FASHION",
  "BEAUTY",
  "SPORTS",
  "ELECTRONICS",
  "HOME_INTERIOR",
  "HOUSEHOLD_SUPPLIES",
  "KITCHENWARE",
];

export const CreateUser = s.object({
  // 사용자 필드
  email: s.define("Email", isEmail),
  firstName: s.size(s.string(), 1, 30),
  lastName: s.size(s.string(), 1, 30),
  address: s.string(),

  // 사용자 설정 필드
  userPreference: s.object({
    receiveEmail: s.boolean(),
  }),
});

export const PatchUser = s.partial(CreateUser);

export const CreateProduct = s.object({
  name: s.size(s.string(), 1, 60),
  description: s.optional(s.string()),
  brand: s.string(),
  category: s.enums(CATEGORIES),
  price: s.min(s.number(), 0),
  stock: s.min(s.integer(), 0),
});

export const PatchProduct = s.partial(CreateProduct);

export const PostSavedProduct = s.object({
  productId: s.string(),
});

export const CreateOrder = s.object({
  userId: s.string(),
  orderItems: s.size(
    s.array(
      s.object({
        productId: s.string(),
        unitPrice: s.min(s.number(), 0),
        quantity: s.min(s.integer(), 1),
      })
    ),
    1,
    Infinity
  ),
});

export const PatchOrder = s.object({
  status: s.enums(['PENDING', 'COMPLETE']),
});
