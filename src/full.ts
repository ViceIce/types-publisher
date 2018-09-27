import * as yargs from "yargs";

import calculateVersions from "./calculate-versions";
import clean from "./clean";
import createSearchIndex from "./create-search-index";
import generatePackages from "./generate-packages";
import { getDefinitelyTyped } from "./get-definitely-typed";
import { Options } from "./lib/common";
import { UncachedNpmInfoClient } from "./lib/npm-client";
import parseDefinitions from "./parse-definitions";
import publishPackages from "./publish-packages";
import publishRegistry from "./publish-registry";
import uploadBlobs from "./upload-blobs";
import { assertDefined, currentTimeStamp, done, numberOfOsProcesses } from "./util/util";
import validate from "./validate";

if (!module.parent) {
	const dry = !!yargs.argv.dry;
	done(full(dry, currentTimeStamp(), Options.azure)); //->defaults
}

export default async function full(dry: boolean, timeStamp: string, options: Options): Promise<void> {
	const infoClient = new UncachedNpmInfoClient();
	await clean();
	const dt = await getDefinitelyTyped(options);
	await parseDefinitions(dt, options.parseInParallel
			? { nProcesses: numberOfOsProcesses, definitelyTypedPath: assertDefined(options.definitelyTypedPath) }
			: undefined);
	await calculateVersions(/*forceUpdate*/ false, dt, infoClient);
	await generatePackages(dt);
	await createSearchIndex(/*skipDownloads*/ false, /*full*/ false, infoClient, options);
	await publishPackages(dry, dt);
	await publishRegistry(dt, dry, infoClient);
	await validate(dt);
	if (!dry) {
		await uploadBlobs(timeStamp);
	}
}
