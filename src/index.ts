import crypto, { type BinaryLike } from "crypto";
import config from "../config.json";

const PORT = process.env.PORT || 3000;
const SECRET = process.env.WEBHOOK_SECRET || "";

function verifySignature(request: Request, body: BinaryLike) {
	const signature = request.headers.get("x-hub-signature-256");
	if (!signature) return false;

	const hash = `sha256=${crypto
		.createHmac("sha256", SECRET)
		.update(body)
		.digest("hex")}`;

	return crypto.timingSafeEqual(
		Buffer.from(hash) as any,
		Buffer.from(signature) as any
	);
}

async function handleRequest(req: Request) {
	const url = new URL(req.url);

	if (url.pathname !== "/github-webhook") {
		return Response.json({ message: "Not Found" }, { status: 404 });
	}

	const body = await req.text();
	if (!verifySignature(req, body)) {
		return Response.json({ message: "Invalid signature" }, { status: 401 });
	}

	const payload = JSON.parse(body);

	const [k, v] =
		Object.entries(config.tasks).find(([k, v]) => v.ref === payload.ref) ||
		[];
	if (!k || !v) {
		return Response.json({ message: "No action taken." }, { status: 200 });
	}

	// const { exitCode: gitExitCode } = await $`git pull`.cwd(v.path);

	// if (gitExitCode !== 0)
	// 	return Response.json(
	// 		{ message: "Error pulling from git." },
	// 		{ status: 500 }
	// 	);

	// for (const command of v.build) {
	// 	const { stdout, stderr, exitCode } = await $`${command}`.cwd(v.path);
	// 	console.log(`stdout: ${stdout}`);
	// 	if (stderr) console.error(`stderr: ${stderr}`);
	// 	if (exitCode !== 0)
	// 		return Response.json(
	// 			{ message: `Error building. (command: ${command})` },
	// 			{ status: 500 }
	// 		);
	// }

	// const { exitCode: pm2ExitCode } = await $`pm2 restart ${k}`;
	// if (pm2ExitCode !== 0)
	// 	return Response.json(
	// 		{ message: "Error restarting pm2." },
	// 		{ status: 500 }
	// 	);

	const commands = [
		["git", "pull"],
		...v.build,
		[`${config.binPath}/pm2`, "restart", k],
	];

	commands.forEach(async (command) => {
		const { stdout, stderr, exitCode, exited } = Bun.spawn(command, {
			cwd: v.path,
			stderr: "inherit",
			stdout: "inherit",
		});
		await exited;
		if (exitCode !== 0)
			return Response.json(
				{ message: `Error building. (command: ${command})` },
				{ status: 500 }
			);
	});

	return new Response("Completed build.", {
		status: 200,
	});
}

Bun.serve({
	port: PORT,
	fetch: handleRequest,
});
