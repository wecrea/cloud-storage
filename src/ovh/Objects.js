import Tools from "../libs/Tools.js";
import HttpRequest from "../libs/HttpRequest.js";
import OvhError from "../exceptions/OvhError.js";
import ObjectsMeta from "./ObjectsMeta.js";
import fs from "fs";

export default class Objects {
  /**
   * Object constructor
   *
   * @param {OVHStorage} context OVHObjectStorage context
   */
  constructor(context, container) {
    this.context = context;
    this.container = container;
    this.object = null;
    this.localPath = context.config.localpath ?? "../../../cloud-storage/";
  }

  use(object) {
    this.object = this.verifyObjectName(object);
    return this;
  }

  verifyObjectName(name) {
    if (Tools.isUndefined(name)) {
      throw new OvhError("Object name is expected.");
    }

    if (Tools.isEmpty(name)) {
      throw new OvhError("Object name is expected.");
    }

    if (!Tools.isString(name)) {
      throw new OvhError("Object name must be a string.");
    }

    if (Tools.contains(name, "/") || Tools.contains(name, " ")) {
      throw new OvhError("Object name contains slash or space.");
    }

    return Tools.toSlug(name);
  }

  setLocalPath(path) {
    if (!fs.existsSync(path)) {
      throw new OvhError(`Object : Path ${path} does not exist.`);
    }
    this.localPath = path;
  }

  verifyObjectExists() {
    if (
      Tools.isUndefined(this.object) ||
      Tools.isEmpty(this.object) ||
      this.object === null
    ) {
      throw new OvhError("You must add object name with use() method.");
    }
  }

  async upload(localFilename, distantFilename) {
    this.object = this.verifyObjectName(distantFilename);
    const path = this.localPath + "/" + localFilename;

    const stats = fs.statSync(path);
    const fileSizeInBytes = stats.size;

    let stream = fs.createReadStream(path);

    const req = new HttpRequest(this.context);
    req.addHeaders({
      "Content-length": fileSizeInBytes,
    });

    const response = await req.uploadStream(
      "/" + this.container + "/" + this.object,
      stream
    );
    stream.close();

    return response.headers.raw();
  }

  async download(path) {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const finalPath = this.localPath + path;

    // Test if path exist to store the file
    let testPath = finalPath.split("/");
    testPath.pop(); // without filename because it does not exist at this moment ^^
    testPath = testPath.join("/");
    if (!fs.existsSync(testPath)) {
      throw new OvhError(`Object.download : Path ${testPath} does not exist.`);
    }

    const req = new HttpRequest(this.context);
    const response = await req.get("/" + this.container + "/" + this.object);
    await response.body.pipe(fs.createWriteStream(finalPath));
    return response.headers.raw();
  }

  async downloadStream(out) {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.get("/" + this.container + "/" + this.object);
    await response.body.pipe(out);
    return response.headers.raw();
  }

  async exist() {
    this.verifyObjectExists();

    const req = new HttpRequest(this.context);
    req.disabledCheckResponseStatus();

    const response = await req.get("/" + this.container + "/" + this.object);

    if (response.status === 404) {
      return false;
    }

    return true;
  }

  async info() {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.head("/" + this.container + "/" + this.object);

    return response.headers.raw();
  }

  async get() {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.get("/" + this.container + "/" + this.object);
    return await response.buffer();
  }

  async copy(container, filename = null) {
    //todo : v2
  }

  async delete() {
    if (!this.exist()) {
      throw new OvhError(
        `Object ${this.object} does not exist in container ${this.container}`
      );
    }

    const req = new HttpRequest(this.context);
    const response = await req.delete("/" + this.container + "/" + this.object);
    return response.headers.raw();
  }

  async deleteMany(filenames) {
    if (!Array.isArray(filenames)) {
      throw new OvhError(
        `Object.deleteMany : You must provide an array of filenames`
      );
    }

    let result = [];
    filenames.forEach(async (filename) => {
      let tmp = await this.use(filename).delete();
      result.push(tmp);
    });

    return result;
  }

  async metas() {
    const path = this.container + "/" + this.object;
    const headers = await this.info();
    return new ObjectsMeta(this.context, path, headers);
  }

  /**
   *
   *
   *
   *
   * OLD METHODS
   *
   *
   *
   */
  downloadOLD(path, pathLocal) {
    return new Promise(async (resolve, reject) => {
      try {
        // check
        if (_.isUndefined(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is expected.");
        if (!_.isString(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is not a string.");
        if (!_.includes(path, "/"))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            "Path parameter isn't valid : container/filename.ext."
          );

        if (_.isUndefined(pathLocal))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Local path parameter is expected.");
        if (!_.isString(pathLocal))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Local path parameter is not a string.");

        // check if file exist
        if (!(await this.context.objects().exist(path)))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("File path does not seem to exist.");

        let writeStream = fs.createWriteStream(pathLocal);

        let file = (() => {
          let p = path.split("/");
          if (p[0] === "") delete p[0];

          p = _.filter(p, (r) => {
            return !_.isUndefined(r);
          });

          return p.join("/");
        })();

        fetch(encodeURI(this.context.endpoint.url + "/" + file), {
          method: "GET",
          headers: {
            "X-Auth-Token": this.context.token,
            Accept: "application/json",
          },
        }).then((res) => {
          res.body.pipe(writeStream);
        });
        writeStream.on("error", (e) => {
          throw e;
        });
        writeStream.on("finish", () => {
          if (fs.existsSync(pathLocal)) fs.unlink(pathLocal);
          return resolve(true);
        });
      } catch (e) {
        if (fs.existsSync(pathLocal)) fs.unlink(pathLocal);
        return reject(e);
      }
    });
  }

  directDownloadOLD(path, out) {
    return new Promise(async (resolve, reject) => {
      try {
        // check
        if (_.isUndefined(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is expected.");
        if (!_.isString(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is not a string.");
        if (!_.includes(path, "/"))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            "Path parameter isn't valid : container/filename.ext."
          );

        // check if file exist
        if (!(await this.context.objects().exist(path)))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("File path does not seem to exist.");

        let file = (() => {
          let p = path.split("/");
          if (p[0] === "") delete p[0];

          p = _.filter(p, (r) => {
            return !_.isUndefined(r);
          });

          return p.join("/");
        })();

        fetch(encodeURI(this.context.endpoint.url + "/" + file), {
          method: "GET",
          headers: {
            "X-Auth-Token": this.context.token,
            Accept: "application/json",
          },
        }).then((res) => {
          return resolve(res.body.pipe(out));
        });
      } catch (e) {
        if (fs.existsSync(pathLocal)) fs.unlink(pathLocal);
        return reject(e);
      }
    });
  }

  /**
   * Save file data
   *
   * @param {Buffer|Uint8Array|Blob|string|Readable} file data to save
   * @param {String} path Path where to store the file
   *
   * @async
   * @return {Promise<Object>}
   */
  saveDataOLD(data, path) {
    return new Promise(async (resolve, reject) => {
      try {
        // check
        if (_.isUndefined(data))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Local file data parameter is expected.");

        if (_.isUndefined(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is expected.");
        if (!_.isString(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is not a string.");
        if (!_.includes(path, "/"))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            "Path parameter isn't valid : container/filename.ext."
          );

        // check if container exist
        if (
          !(await this.context.containers().exist(
            (() => {
              let p = path.split("/");
              if (p[0] === "") delete p[0];

              p = _.filter(p, (r) => {
                return !_.isUndefined(r);
              });

              if (_.count(p) <= 0) return "";

              return p[0];
            })()
          ))
        )
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Container does not seem to exist.");

        /*request(
          {
            method: "PUT",
            uri: encodeURI(this.context.endpoint.url + path),
            headers: {
              "X-Auth-Token": this.context.token,
              Accept: "application/json",
            },
            body: data,
          },
          (err, res, body) => {
            err = err || request.checkIfResponseIsError(res);
            if (err)
              // noinspection ExceptionCaughtLocallyJS
              throw new Error(err);

            return resolve(res.headers);
          }
        );*/
        fetch(encodeURI(this.context.endpoint.url + path), {
          method: "PUT",
          headers: {
            "X-Auth-Token": this.context.token,
            Accept: "application/json",
          },
          body: data,
        })
          .then((result) => {
            return resolve(result.headers.raw());
          })
          .catch((e) => {
            return reject(e);
          });
      } catch (e) {
        return reject(e);
      }
    });
  }

  /**
   * Save file
   *
   * @param {String} file Local file path to save
   * @param {String} path Path where to store the file
   *
   * @async
   * @return {Promise<Object>}
   */
  saveFileOLD(file, path) {
    return new Promise(async (resolve, reject) => {
      try {
        // check
        if (_.isUndefined(file))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Local file path parameter is expected.");
        if (!_.isString(file))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Local file path parameter is not a string.");
        if (!fs.existsSync(file))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Local file does not seem to exist.");

        if (_.isUndefined(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is expected.");
        if (!_.isString(path))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Path parameter is not a string.");
        if (!_.includes(path, "/"))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            "Path parameter isn't valid : container/filename.ext."
          );

        // check if container exist
        if (
          !(await this.context.containers().exist(
            (() => {
              let p = path.split("/");
              if (p[0] === "") delete p[0];

              p = _.filter(p, (r) => {
                return !_.isUndefined(r);
              });

              if (_.count(p) <= 0) return "";

              return p[0];
            })()
          ))
        )
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Container does not seem to exist.");

        let stream = fs.createReadStream(file);
        stream.pipe(
          request(
            {
              method: "PUT",
              uri: encodeURI(this.context.endpoint.url + path),
              headers: {
                "X-Auth-Token": this.context.token,
                Accept: "application/json",
              },
            },
            (err, res, body) => {
              err = err || request.checkIfResponseIsError(res);
              if (err)
                // noinspection ExceptionCaughtLocallyJS
                throw new Error(err);

              stream.close();
              return resolve(res.headers);
            }
          )
          /*fetch(encodeURI(this.context.endpoint.url + path), {
            method: "PUT",
            headers: {
              "X-Auth-Token": this.context.token,
              Accept: "application/json",
            },
          })
            .then((result) => {
              stream.close();
              return resolve(result.headers.raw());
            })
            .catch((e) => {
              return reject(e);
            })*/
        );
      } catch (e) {
        return reject(e);
      }
    });
  }

  /* WARNING : KEEP TO REWRITE
  copy(pathOrigin, pathToPaste) {
    return new Promise(async (resolve, reject) => {
      try {
        if (_.isUndefined(pathOrigin))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Original file path parameter is expected.");
        if (!_.isString(pathOrigin))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Original file path parameter is not a string.");
        if (!_.includes(pathOrigin, "/"))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            "Original file path parameter isn't valid : container/filename.ext."
          );

        if (_.isUndefined(pathToPaste))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Copy file path parameter is expected.");
        if (!_.isString(pathToPaste))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Copy file path parameter is not a string.");
        if (!_.includes(pathToPaste, "/"))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error(
            "Copy file path parameter isn't valid : container/filename.ext."
          );

        // check if file exist
        if (!(await this.context.objects().exist(pathOrigin)))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("Original file path path does not seem to exist.");
        if (await this.context.objects().exist(pathToPaste))
          // noinspection ExceptionCaughtLocallyJS
          throw new Error("A file with destination path already exist.");

        let pathOriginFile = (() => {
          let p = pathOrigin.split("/");
          if (p[0] === "") delete p[0];

          p = _.filter(p, (r) => {
            return !_.isUndefined(r);
          });

          return p.join("/");
        })();
        let pathToPasteFile = (() => {
          let p = pathToPaste.split("/");
          if (p[0] === "") delete p[0];

          p = _.filter(p, (r) => {
            return !_.isUndefined(r);
          });

          return p.join("/");
        })();

        fetch(encodeURI(this.context.endpoint.url + "/" + pathOriginFile), {
          method: "COPY",
          headers: {
            "X-Auth-Token": this.context.token,
            Accept: "application/json",
            Destination: "/" + pathToPasteFile,
          },
        })
          .then((result) => {
            return resolve(result.headers.raw());
          })
          .catch((e) => {
            return reject(e);
          });
      } catch (e) {
        return reject(e);
      }
    });
  }*/
}
