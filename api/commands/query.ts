import * as protos from "@dataform/protos";
import * as dbadapters from "../dbadapters";
import * as path from "path";
import { fork } from "child_process";
import { compile as vmCompile } from "../vm/query";

interface IOptions {
  projectDir?: string;
}

export function run(profile: protos.IProfile, query: string, options?: IOptions): Promise<any[]> {
  return compile(query, options).then(compiledQuery => dbadapters.create(profile).execute(compiledQuery));
}

export function evaluate(profile: protos.IProfile, query: string, options?: IOptions): Promise<void> {
  return compile(query, options).then(compiledQuery => dbadapters.create(profile).evaluate(compiledQuery));
}

export function compile(query: string, options?: IOptions): Promise<string> {
  // If there is no project directory, no need to compile the script.
  if (!options.projectDir) {
    return Promise.resolve(query);
  }
  // Resolve the path in case it hasn't been resolved already.
  const projectDir = path.resolve(options.projectDir);
  var child = fork(require.resolve("../vm/query_bin_loader"));
  return new Promise((resolve, reject) => {
    var timeout = 5000;
    var timeoutStart = Date.now();
    var checkTimeout = () => {
      if (child.killed) return;
      if (Date.now() > timeoutStart + timeout) {
        child.kill();
        reject(new Error("Compilation timed out"));
      } else {
        setTimeout(checkTimeout, 100);
      }
    };
    checkTimeout();
    child.on("message", obj => {
      if (!child.killed) child.kill();
      if (obj.err) {
        reject(new Error(obj.err));
      } else {
        resolve(obj.result);
      }
    });
    child.send({ query, projectDir });
  });
}
