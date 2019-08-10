/*
 *File: DockerSandbox.js
 *Author: Osman Ali Mian/Asad Memon
 *Created: 3rd June 2014
 *Revised on: 25th June 2014 (Added folder mount permission and changed executing user to nobody using -u argument)
 *Revised on: 30th June 2014 (Changed the way errors are logged on console, added language name into error messages)
 */

/**
 * @Constructor
 * @variable DockerSandbox
 * @description This constructor stores all the arguments needed to prepare and execute a Docker Sandbox
 * @param {Number} timeout_value: The Time_out limit for code execution in Docker
 * @param {String} path: The current working directory where the current API folder is kept
 * @param {String} folder: The name of the folder that would be mounted/shared with Docker container, this will be concatenated with path
 * @param {String} vm_name: The TAG of the Docker VM that we wish to execute
 * @param {String} compiler_name: The compiler/interpretor to use for carrying out the translation
 * @param {String} file_name: The file_name to which source code will be written
 * @param {String} code: The actual code
 * @param {String} output_command: Used in case of compilers only, to execute the object code, send " " in case of interpretors
 */

const FILE_SIZE_EXCEEDED = "FILE_SIZE_EXCEEDED";
const FILE_NOT_FOUND = "FILE_NOT_FOUND";
const FILE_READY = "FILE_READY";
const OUT_TOO_LARGE = "Output is too large to display";

var DockerSandbox = function(
  timeout_value,
  path,
  folder,
  vm_name,
  compiler_name,
  file_name,
  code,
  output_command,
  languageName,
  e_arguments,
  stdin_data
) {
  this.timeout_value = timeout_value;
  this.path = path;
  this.folder = folder;
  this.vm_name = vm_name;
  this.compiler_name = compiler_name;
  this.file_name = file_name;
  this.code = code;
  this.output_command = output_command;
  this.langName = languageName;
  this.extra_arguments = e_arguments;
  this.stdin_data = stdin_data;
};

/**
 * @function
 * @name DockerSandbox.run
 * @description Function that first prepares the Docker environment and then executes the Docker sandbox
 * @param {Function pointer} success ?????
 */
DockerSandbox.prototype.run = function(success) {
  var sandbox = this;

  this.prepare(function() {
    sandbox.execute(success);
  }).catch(e => {
    console.log("Sandbox run error");
    console.error(e);
  });
};

/*
 * @function
 * @name DockerSandbox.prepare
 * @description Function that creates a directory with the folder name already provided through constructor
 * and then copies contents of folder named Payload to the created folder, this newly created folder will be mounted
 * on the Docker Container. A file with the name specified in file_name variable of this class is created and all the
 * code written in 'code' variable of this class is copied into this file.
 * Summary: This function produces a folder that contains the source file and 2 scripts, this folder is mounted to our
 * Docker container when we run it.
 * @param {Function pointer} success ?????
 */
DockerSandbox.prototype.prepare = function(success) {
  const exec = require("child_process").exec;
  const fs = require("fs").promises;
  const sandbox = this;

  const command = `mkdir ${this.path}${this.folder} && cp ${
    this.path
  }/Payload/* ${this.path}${this.folder} && chmod 777 ${this.path}${
    this.folder
  }`;

  return new Promise((resolve, reject) => {
    const commandChildProcess = exec(command);
    commandChildProcess.stderr.on("data", () => {});

    commandChildProcess.stdout.on("data", () => {});

    commandChildProcess.on("close", code => {
      console.log(`child process close all stdio with code ${code}`);
    });

    commandChildProcess.on("exit", async code => {
      console.log(`child process exited with code ${code}`);
      try {
        await fs.writeFile(
          this.path + this.folder + "/" + this.file_name,
          this.code
        );
        const codeFileChildProcess = exec(
          `chmod 777 '${this.path}${this.folder}/${this.file_name}'`
        );
        codeFileChildProcess.on("exit", async code => {
          console.log(`codeFileChildProcess existed with code ${code}`);
          try {
            await fs.writeFile(
              sandbox.path + sandbox.folder + "/inputFile",
              sandbox.stdin_data
            );
            success();
            resolve();
          } catch (e) {
            reject(e);
          }
        });
      } catch (e) {
        reject(e);
      }
    });
  });
};

/*
 * @function
 * @name DockerSandbox.execute
 * @precondition: DockerSandbox.prepare() has successfully completed
 * @description: This function takes the newly created folder prepared by DockerSandbox.prepare() and spawns a Docker container
 * with the folder mounted inside the container with the name '/usercode/' and calls the script.sh file present in that folder
 * to carry out the compilation. The Sandbox is spawned ASYNCHRONOUSLY and is supervised for a timeout limit specified in timeout_limit
 * variable in this class. This function keeps checking for the file "Completed" until the file is created by script.sh or the timeout occurs
 * In case of timeout an error message is returned back, otherwise the contents of the file (which could be the program output or log of
 * compilation error) is returned. In the end the function deletes the temporary folder and exits
 *
 * Summary: Run the Docker container and execute script.sh inside it. Return the output generated and delete the mounted folder
 *
 * @param {Function pointer} success ?????
 */

DockerSandbox.prototype.execute = function(success) {
  const exec = require("child_process").exec;
  const fs = require("fs").promises;
  const myC = 0; //variable to enforce the timeout_value
  const sandbox = this;

  //this statement is what is executed
  const st =
    this.path +
    "DockerTimeout.sh " +
    this.timeout_value +
    "s -e 'NODE_PATH=/usr/local/lib/node_modules' -i -t -v  \"" +
    this.path +
    this.folder +
    '":/usercode ' +
    this.vm_name +
    " /usercode/script.sh " +
    this.compiler_name +
    " " +
    this.file_name +
    " " +
    this.output_command +
    " " +
    this.extra_arguments;

  //log the statement in console
  console.log(st);

  //execute the Docker, This is done ASYNCHRONOUSLY
  const dockerChildProcess = exec(st);

  dockerChildProcess.on("exit", async (code, signal) => {
    console.log(
      `dockerChildProcess exited with code: ${code} signal: ${signal}`
    );

    const completedPath = `${this.path}${this.folder}/completed`;
    const logFilePath = `${this.path}${this.folder}/logfile.txt`;

    const checkFileSizeFromStats = stats => {
      const fileSize = stats.size;
      const fileSizeInMB = fileSize / 1000000.0;

      if (fileSizeInMB > 25) {
        return FILE_SIZE_EXCEEDED;
      }
      return FILE_READY;
    };

    fs.stat(completedPath)
      .then(checkFileSizeFromStats)
      .catch(error => {
        console.log("Complete Path error");
        console.error(error);
        return FILE_NOT_FOUND;
      })
      .then(fileStatus => {
        switch (fileStatus) {
          case FILE_NOT_FOUND:
            return fs
              .stat(logFilePath)
              .then(checkFileSizeFromStats)
              .catch(() => FILE_NOT_FOUND)
              .then(logFileStats => {
                switch (logFileStats) {
                  case FILE_NOT_FOUND:
                    return `Execution Timed Out`;
                  case FILE_READY:
                    return fs
                      .readFile(logFilePath, { encoding: "utf-8" })
                      .then(response => `${response}\nExecution Timed Out`);
                  case FILE_SIZE_EXCEEDED:
                    console.log("Log file size exceeded");
                    return `Execution Timed Out`;
                  default:
                    throw Error(
                      `fileStatus should be one of FILE_NOT_FOUND, FILE_SIZE_EXCEEDED, FILE_READY`
                    );
                }
              })
              .catch(error => {
                console.log("Log file error ");
                console.error(error);
                return `Execution Timed Out`;
              });
          case FILE_SIZE_EXCEEDED:
            return Promise.resolve(OUT_TOO_LARGE);
          case FILE_READY:
            return fs.readFile(completedPath, { encoding: "utf-8" });
          default:
            throw Error(
              `fileStatus should be one of FILE_NOT_FOUND, FILE_SIZE_EXCEEDED, FILE_READY`
            );
        }
      })
      .then(async response => {
        let errorsResult = "";
        try {
          errorsResult = await fs.readFile(
            `${this.path}${this.folder}/errors`,
            { encoding: "utf-8" }
          );
        } catch (error) {
          console.log("Failed to read errors file");
          console.error(error);
        }
        const endOfInputIndex = response
          .toString()
          .indexOf("*-COMPILEBOX::ENDOFOUTPUT-*");
        const lines =
          endOfInputIndex !== -1
            ? response.toString().split("*-COMPILEBOX::ENDOFOUTPUT-*")
            : response.toString().split("*---*");
        const time = lines[1] || this.timeout_value;
        const result = lines[0];
        console.log(`Time: ${time}`);
        success(result, time, errorsResult);
      })
      .catch(() => {})
      .then(() => {
        return new Promise((resolve, reject) => {
          const removeChildProcess = exec(`rm -rf ${this.path}${this.folder}`);
          removeChildProcess.on("exit", (code, signal) => {
            resolve();
            console.log(
              `Remove temp folder exited with ${code} signal : ${signal}`
            );
          });

          removeChildProcess.on("error", error => {
            reject();
            console.error(error);
          });
        });
      })
      .catch(error => {
        console.log("Failed to remove folder ", this.folder);
        console.error(error);
      });
  });
  console.log("------------------------------");
};

module.exports = DockerSandbox;
