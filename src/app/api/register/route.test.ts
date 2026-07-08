import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB and next-auth's signIn before importing the route, since the
// real db client (src/lib/db/index.ts) throws without a live DATABASE_URL
// and the real signIn() needs a running next-auth request context — neither
// is available in this sandbox (no live Postgres, see agents-logs.txt).
// These mocks let us test the route's own logic (validation, duplicate
// detection, hashing, response shape) in isolation, per implement.md Step 3
// ("mock the db call ... do not require a live Postgres").
const selectMock = vi.fn();
const insertMock = vi.fn();
const signInMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

vi.mock("@/auth", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

const { POST } = await import("./route");

function makeSelectChain(result: unknown[]) {
  return {
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(result),
      }),
    }),
  };
}

function makeInsertChain(result: unknown[]) {
  return {
    values: () => ({
      returning: () => Promise.resolve(result),
    }),
  };
}

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/register", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    signInMock.mockReset();
  });

  // Given/When/Then: PLAN.md acceptance criterion —
  // "Given no account exists for email, when a user submits valid
  // registration data, then a user row is created with a bcrypt password
  // hash and the user is signed in."
  it("given no existing account, when valid registration data is submitted, then it creates the user and signs in, returning 201", async () => {
    selectMock.mockReturnValue(makeSelectChain([])); // no existing user
    insertMock.mockReturnValue(makeInsertChain([{ id: "new-user-id" }]));
    signInMock.mockResolvedValue(undefined);

    const res = await POST(
      jsonRequest({
        email: "New@Example.com",
        password: "hunter2222",
        name: "New User",
      })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ id: "new-user-id" });

    // Email normalized before both the duplicate check and the insert.
    expect(selectMock).toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalled();
    const insertedValues = insertMock.mock.results[0]?.value;
    expect(insertedValues).toBeTruthy();

    // signIn was called with the normalized email and the raw password so
    // the user is authenticated immediately after registration.
    expect(signInMock).toHaveBeenCalledWith(
      "credentials",
      expect.objectContaining({
        email: "new@example.com",
        password: "hunter2222",
        redirect: false,
      })
    );
  });

  it("given valid registration data, when the user row is inserted, then the stored password is a bcrypt hash, not the plaintext", async () => {
    selectMock.mockReturnValue(makeSelectChain([]));
    let capturedValues: Record<string, unknown> | undefined;
    insertMock.mockImplementation(() => ({
      values: (v: Record<string, unknown>) => {
        capturedValues = v;
        return { returning: () => Promise.resolve([{ id: "id-1" }]) };
      },
    }));
    signInMock.mockResolvedValue(undefined);

    await POST(
      jsonRequest({ email: "hash@example.com", password: "plaintext-pw" })
    );

    expect(capturedValues).toBeDefined();
    expect(capturedValues!.passwordHash).not.toBe("plaintext-pw");
    expect(typeof capturedValues!.passwordHash).toBe("string");
    expect((capturedValues!.passwordHash as string).length).toBeGreaterThan(
      10
    );
  });

  // Given/When/Then: PLAN.md acceptance criterion —
  // "Given an account already exists for email, when a user submits
  // registration with that email, then the request is rejected with a
  // clear error and no duplicate row is created."
  it("given an account already exists for the email, when registration is submitted, then it returns 409 and does not insert a row", async () => {
    selectMock.mockReturnValue(makeSelectChain([{ id: "existing-user" }]));

    const res = await POST(
      jsonRequest({ email: "taken@example.com", password: "hunter2222" })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already registered/i);
    expect(insertMock).not.toHaveBeenCalled();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("given an email that differs only in case from an existing account, when registration is submitted, then it is still treated as a duplicate", async () => {
    selectMock.mockReturnValue(makeSelectChain([{ id: "existing-user" }]));

    const res = await POST(
      jsonRequest({ email: "TAKEN@EXAMPLE.com", password: "hunter2222" })
    );

    expect(res.status).toBe(409);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("given the DB insert races and hits a unique violation, when registration is submitted, then it still returns 409 and no error escapes", async () => {
    selectMock.mockReturnValue(makeSelectChain([])); // check passes (no existing row)
    const pgError = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });
    insertMock.mockReturnValue({
      values: () => ({
        returning: () => Promise.reject(pgError),
      }),
    });

    const res = await POST(
      jsonRequest({ email: "race@example.com", password: "hunter2222" })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/already registered/i);
  });

  it("given invalid input (short password), when registration is submitted, then it returns 400 and does not touch the DB", async () => {
    const res = await POST(
      jsonRequest({ email: "short@example.com", password: "short" })
    );

    expect(res.status).toBe(400);
    expect(selectMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("given invalid input (malformed email), when registration is submitted, then it returns 400", async () => {
    const res = await POST(
      jsonRequest({ email: "not-an-email", password: "hunter2222" })
    );

    expect(res.status).toBe(400);
  });

  it("given the user row is created but automatic sign-in fails, when registration is submitted, then it still returns 201 with a warning", async () => {
    selectMock.mockReturnValue(makeSelectChain([]));
    insertMock.mockReturnValue(makeInsertChain([{ id: "new-user-id" }]));
    // Simulate next-auth's CredentialsSignin (an AuthError subclass) without
    // importing next-auth in the test — see the DECISION comment in
    // route.ts for why the route duck-types on `type` instead of using
    // `instanceof AuthError`.
    signInMock.mockRejectedValue(
      Object.assign(new Error("CredentialsSignin"), { type: "CredentialsSignin" })
    );

    const res = await POST(
      jsonRequest({ email: "signinfails@example.com", password: "hunter2222" })
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("new-user-id");
    expect(body.warning).toBeDefined();
  });
});
