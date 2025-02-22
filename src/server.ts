import { randomUUID } from "node:crypto";

import { sql } from "./lib/postgres";

import fastify from "fastify";

import cookie from "@fastify/cookie";
import websocket from "@fastify/websocket";

import { z } from "zod";
import { pollResults } from "./http/ws/poll-results";
import { voting } from "./core/voting-pub-sub";

const app = fastify();

app.register(cookie, {
  secret: "real-time-voting-system",
  hook: "onRequest",
});

app.register(websocket);

app.register(pollResults);

app
  .listen({
    port: 3333,
  })
  .then(() => console.log("http server running!"));

app.post("/polls", async (request, reply) => {
  try {
    const bodySchema = z.object({
      title: z.string().min(2),
      options: z.array(z.string()),
    });

    const { title, options } = bodySchema.parse(request.body);

    const pollId = randomUUID();

    const pollOptions = options.map((option) => ({
      id: randomUUID(),
      title: option,
      pollId,
    }));

    await sql`INSERT INTO polls (id, title, created_at, updated_at) VALUES (${pollId}, ${title}, NOW(), NOW()) RETURNING id`;

    const insertPollOptionsQueries = pollOptions.map(
      async (option) =>
        await sql`INSERT INTO poll_options (id, title, poll_id) VALUES (${option.id}, ${option.title}, ${option.pollId})`
    );

    await Promise.all(insertPollOptionsQueries);

    return reply.send({
      pollId,
    });
  } catch (error) {
    console.log(error);
  }
});

app.get("/polls/:pollId", async (request, reply) => {
  try {
    const paramsSchema = z.object({
      pollId: z.string(),
    });

    const { pollId } = paramsSchema.parse(request.params);

    const result =
      await sql`SELECT p.id AS poll_id, p.title as poll_title, po.id as poll_option_id,  po.title as poll_option_title, created_at, updated_at FROM polls AS p JOIN poll_options as po ON po.poll_id = p.id WHERE p.id = ${pollId}`;

    if (result.length === 0) {
      return reply.status(400).send({
        message: "Poll not found.",
      });
    }

    const poll = {
      id: result[0].poll_id,
      title: result[0].poll_title,
      created_at: result[0].created_at,
      updated_at: result[0].updated_at,
      options: result.map((row) => ({
        id: row.poll_option_id,
        title: row.poll_option_title,
      })),
    };

    return reply.send({ poll });
  } catch (error) {
    console.log(error);
  }
});

app.post("/polls/:pollId/votes", async (request, reply) => {
  const paramsSchema = z.object({
    pollId: z.string(),
  });

  const bodySchema = z.object({
    pollOptionId: z.string(),
  });

  const { pollId } = paramsSchema.parse(request.params);

  const { pollOptionId } = bodySchema.parse(request.body);

  let { sessionId } = request.cookies;

  try {
    if (sessionId) {
      const [sessionValue] = sessionId.split(".");

      const userPreviousVotedOnPoll =
        await sql`SELECT v.id, v.poll_id, v.session_id, v.poll_option_id FROM vote AS v WHERE v.poll_id = ${pollId} AND v.session_id = ${sessionValue}`;

      if (
        userPreviousVotedOnPoll.length > 0 &&
        userPreviousVotedOnPoll[0].poll_option_id !== pollOptionId
      ) {
        const voteId = userPreviousVotedOnPoll[0].id;

        await sql`DELETE from vote WHERE vote.id = ${voteId}`;

        await sql`INSERT INTO vote (id, session_id, poll_id, poll_option_id, created_at) VALUES (${randomUUID()}, ${sessionValue}, ${pollId}, ${pollOptionId}, NOW())`;
      } else if (userPreviousVotedOnPoll) {
        return reply
          .status(400)
          .send({ message: "You have already voted on this poll." });
      }
    }

    if (!sessionId) {
      sessionId = randomUUID();

      reply.setCookie("sessionId", sessionId, {
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
        signed: true,
        httpOnly: true,
      });

      await sql`INSERT INTO vote (id, session_id, poll_id, poll_option_id, created_at) VALUES (${randomUUID()}, ${sessionId}, ${pollId}, ${pollOptionId}, NOW())`;

      const pollResult =
        await sql`SELECT po.title, COUNT(v.id) AS vote_count FROM poll_options AS po LEFT JOIN vote AS v ON v.poll_option_id = po.id where po.poll_id = ${pollId} GROUP BY po.title`;

      voting.publish(pollId, {
        pollOptionId,
        votes: 10,
      });

      return reply.status(201).send();
    }
  } catch (error) {
    console.log(error);
  }
});
