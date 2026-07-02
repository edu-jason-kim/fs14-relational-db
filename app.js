import "dotenv/config";
import express from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  CreateUser,
  CreateProduct,
  PatchUser,
  PostSavedProduct,
  CreateOrder,
} from "./struct.js";
import { assert } from "superstruct";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("server is alive");
});

/*********** users ***********/
app.get("/users", async (req, res) => {
  const { offset = 0, limit = 10, order = "newest" } = req.query;

  let orderBy;
  switch (order) {
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "newest":
    default:
      orderBy = { createdAt: "desc" };
  }

  const users = await prisma.user.findMany({
    orderBy,
    skip: parseInt(offset),
    take: parseInt(limit),
    include: { userPreference: { select: { receiveEmail: true } } },
  });
  res.send(users);
});

app.get("/users/:id", async (req, res) => {
  const { id } = req.params;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { userPreference: true },
  });
  res.send(user);
});

app.get("/users/:id/orders", async (req, res) => {
  const { id } = req.params;
  const { orders } = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { orders: true },
  });
  res.send(orders);
});

app.post("/users", async (req, res) => {
  assert(req.body, CreateUser);
  const { userPreference, email, firstName, lastName, address } = req.body;

  const user = await prisma.user.create({
    data: {
      // 사용자 필드들
      email,
      firstName,
      lastName,
      address,

      // 사용자 설정 필드들
      userPreference: {
        create: userPreference,
      },
    },
    include: { userPreference: true },
  });
  res.status(201).send(user);
});

app.patch("/users/:id", async (req, res) => {
  assert(req.body, PatchUser);
  const { id } = req.params;

  const { userPreference, ...userFields } = req.body;

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...userFields,
      userPreference: { update: userPreference },
    },
    include: { userPreference: true },
  });
  res.send(user);
});

app.delete("/users/:id", async (req, res) => {
  const { id } = req.params;
  await prisma.user.delete({ where: { id } });
  res.sendStatus(204);
});

app.get("/users/:id/saved-products", async (req, res) => {
  const { id } = req.params;
  const { savedProducts } = await prisma.user.findUniqueOrThrow({
    where: { id },
    include: { savedProducts: true },
  });
  res.send(savedProducts);
});

app.post("/users/:id/saved-products", async (req, res) => {
  assert(req.body, PostSavedProduct);
  const { id: userId } = req.params;
  const { productId } = req.body;

  const { savedProducts } = await prisma.user.update({
    where: { id: userId },
    data: {
      savedProducts: { connect: { id: productId } },
    },
    include: { savedProducts: true },
  });
  res.send(savedProducts);
});

/** Products */
app.get("/products", async (req, res) => {
  const { offset = 0, limit = 10, order = "newest", category } = req.query;

  let orderBy;
  switch (order) {
    case "priceLowest":
      orderBy = { price: "asc" };
      break;
    case "priceHighest":
      orderBy = { price: "desc" };
      break;
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "newest":
    default:
      orderBy = { createdAt: "desc" };
  }

  const products = await prisma.product.findMany({
    where: category ? { category } : {},
    orderBy,
    skip: parseInt(offset),
    take: parseInt(limit),
  });
  res.send(products);
});

app.get("/products/:id", async (req, res) => {
  const { id } = req.params;
  const product = await prisma.product.findUniqueOrThrow({ where: { id } });
  res.send(product);
});

app.post("/products", async (req, res) => {
  assert(req.body, CreateProduct);
  const product = await prisma.product.create({ data: req.body });
  res.status(201).send(product);
});

app.patch("/products/:id", async (req, res) => {
  const { id } = req.params;
  const product = await prisma.product.update({
    where: { id },
    data: req.body,
  });
  res.send(product);
});

/** Orders */
app.get("/orders/:id", async (req, res) => {
  const { id } = req.params;
  const order = await prisma.order.findUniqueOrThrow({
    where: { id },
    include: {
      orderItems: {
        include: {
          product: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  let total = 0;
  for (const orderItem of order.orderItems) {
    total += orderItem.quantity * orderItem.unitPrice;
  }
  order.total = total;

  res.send(order);
});

app.post("/orders", async (req, res) => {
  assert(req.body, CreateOrder);
  const { userId, orderItems } = req.body;

  const productIds = orderItems.map((orderItem) => orderItem.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
  });

  // productId의 주문수량을 확인하는 함수
  function getQuantity(productId) {
    const order = orderItems.find(
      (orderItem) => orderItem.productId === productId,
    );
    return order.quantity;
  }

  // 모든 반복에서 true가 나와야만 true를 반환하고, 하나라도 false를 반환하면 false를 반환하는 메서드
  // 따라서, true가 나오면 모든 아이템에 대해서 재고가 주문수량보다 같거나 많기 때문에 주문 가능한 상태
  const isSufficientStock = products.every((product) => {
    const { id, stock } = product;
    return stock >= getQuantity(id);
  });

  if (!isSufficientStock) {
    throw new Error("Insufficient Stock");
  }

  // 아직 실행하지 않음, 상품 재고 감소 쿼리들 (await를 하지 않아서 실행하지 않음)
  const queries = productIds.map((productId) =>
    prisma.product.update({
      where: { id: productId },
      data: { stock: { decrement: getQuantity(productId) } },
    }),
  );

  // $transaction으로 묶어서, 모든 DB 요청이 함께 성공하거나, 하나라고 실패하면 모두 롤백하도록 한다.
  const [order] = await prisma.$transaction([
    // 주문생성
    prisma.order.create({
      data: {
        userId,
        // 주문 items 생성
        orderItems: { create: orderItems },
      },
      include: { orderItems: true },
    }),
    // 상품의 재고 감소 (위 정의한 쿼리들을 가져와서 한번에 실행)
    ...queries,
  ]);

  res.sendStatus(201).send(order);
});

app.use((err, req, res, next) => {
  if (
    err.name === "StructError" ||
    err instanceof Prisma.PrismaClientValidationError
  ) {
    res.status(400).send({ message: err.message });
  } else if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2025"
  ) {
    res.sendStatus(404);
  } else {
    console.error(err);
    res.status(500).send({ message: err.message });
  }
});

app.listen(3001, () => {
  console.log("Server is runnning in port 3001");
});
