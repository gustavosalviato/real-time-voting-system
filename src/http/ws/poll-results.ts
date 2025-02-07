import { FastifyInstance } from "fastify";

import { z } from "zod";
import { voting } from "../../core/voting-pub-sub";

export async function pollResults(app: FastifyInstance) {
  app.get(
    "/polls/:pollId/results",
    { websocket: true },
    async (socket, request) => {
      const paramsSchema = z.object({
        pollId: z.string(),
      });

      const { pollId } = paramsSchema.parse(request.params);

      voting.subscribe(pollId, (message) => {
        socket.send(JSON.stringify(message));
      });
    }
  );
}
