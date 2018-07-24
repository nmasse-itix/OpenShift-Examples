# Using read-only File System in OpenShift containers

## Context

The [CIS Security Best Practices](https://www.cisecurity.org/benchmark/docker/),
mandates the use of a read-only file system in containers.

This guide explains how to use read-only File System in OpenShift.

## Default configuration

By default, when a container is created in OpenShift, the root filesystem is
mounted as read-write.

On this root filesystem, OpenShift applies additional security restrictions:

- Linux File Sytem [DAC](https://en.wikipedia.org/wiki/Discretionary_access_control) (unix permissions)
- SELinux [MAC](https://en.wikipedia.org/wiki/Mandatory_access_control)
- Non-privileged, random UID for the running process

You can easily verify that the root File System is mounted read-write using the
following procedure.

First, create a dummy container based on the RHEL 7.5 image:

```sh
oc new-app --name rootfs registry.access.redhat.com/rhel:7.5
oc patch dc rootfs --type=json -p '[{"op": "add", "path": "/spec/template/spec/containers/0/command", "value": ["/bin/sh", "-c", "while :; do sleep 1; done" ]}]'
```

Watch the container being created:

```sh
oc get pods -w -l app=rootfs
```

Once created, check the container root filesystem mount:

```sh
oc rsh $(oc get pods -l app=rootfs -o name|tail -n 1) mount |head -n 1
```

You should get something like this:

```raw
overlay on / type overlay (rw,relatime,context="system_u:object_r:svirt_sandbox_file_t:s0:c4,c27",lowerdir=/var/lib/docker/overlay2/l/DOKXVDUEKEI37AXQ7HKYX54UGF:/var/lib/docker/overlay2/l/F6L6WHTZAHKPX722FPFCSPJR7Z:/var/lib/docker/overlay2/l/AZIFQJPO3T2VMKKXOLDVL4Y7RI,upperdir=/var/lib/docker/overlay2/2b1a55df9f0b3d935d2c92ea324d79ccfac956a1be469f82662f8305419c615a/diff,workdir=/var/lib/docker/overlay2/2b1a55df9f0b3d935d2c92ea324d79ccfac956a1be469f82662f8305419c615a/work)
```

The root file system is mounted as read-write.

By default, OpenShift is using the `restricted` Security Context Constraints (SCC):

```raw
$ oc describe scc restricted
Name:                            restricted
Priority:                        <none>
Access:
  Users:                         <none>
  Groups:                        system:authenticated
Settings:
  Allow Privileged:              false
  Default Add Capabilities:      <none>
  Required Drop Capabilities:    KILL,MKNOD,SETUID,SETGID
  Allowed Capabilities:          <none>
  Allowed Seccomp Profiles:      <none>
  Allowed Volume Types:          configMap,downwardAPI,emptyDir,persistentVolumeClaim,projected,secret
  Allowed Flexvolumes:           <all>
  Allow Host Network:            false
  Allow Host Ports:              false
  Allow Host PID:                false
  Allow Host IPC:                false
  Read Only Root Filesystem:     false
  Run As User Strategy:          MustRunAsRange
    UID:                         <none>
    UID Range Min:               <none>
    UID Range Max:               <none>
  SELinux Context Strategy:      MustRunAs
    User:                        <none>
    Role:                        <none>
    Type:                        <none>
    Level:                       <none>
  FSGroup Strategy:              MustRunAs
    Ranges:                      <none>
  Supplemental Groups Strategy:  RunAsAny
    Ranges:                      <none>
```

As you can see, the `Read Only Root Filesystem` option is **NOT enabled** in
this SCC.

This means the user can write only where the Unix permissions allow to do so.

This can easily be verified by getting a terminal on the running container:

```sh
oc rsh $(oc get pods -l app=rootfs -o name|tail -n 1)
```

First, try to find a place on the filesystem that is writeable by the current user:

```sh
find / -xdev -writable -ls
```

You should get a similar result:

```raw
286074170    0 lrwxrwxrwx   1 root     root            9 Jul 14 14:24 /etc/systemd/system/systemd-logind.service -> /dev/null
286074171    0 lrwxrwxrwx   1 root     root            9 Jul 14 14:24 /etc/systemd/system/getty.target -> /dev/null
286074172    0 lrwxrwxrwx   1 root     root            9 Jul 14 14:24 /etc/systemd/system/console-getty.service -> /dev/null
286074173    0 lrwxrwxrwx   1 root     root            9 Jul 14 14:24 /etc/systemd/system/sys-fs-fuse-connections.mount -> /dev/null
320708631    0 drwxrwxrwt   2 root     root            6 Jul 14 14:24 /var/tmp
278398210    0 drwxrwxrwt   7 root     root          132 Jul 14 14:24 /tmp
303803069    0 lrwxrwxrwx   1 root     root           10 Jul 14 14:23 /usr/tmp -> ../var/tmp
```

So, the only writeable files and directories on a RHEL7 image are:

- some files in `/etc/systemd/system/` **because they are a symlink to `/dev/null`**
- `/tmp` and `/var/tmp` which are needed by most applications to store their temporary files
- `/usr/tmp` which is a symlink to `/var/tmp`

As you can see, the default RHEL 7.5 image comes with a relevant set of Unix permissions
and do not requires a read-only root file system.

You can convince yourself by creating a file in `/tmp`:

```sh
touch /tmp/foo
```

And being forbidden to create a file elsewhere:

```sh
$ touch /bar
touch: cannot touch '/bar': Permission denied
```

## Mounting the Root FS read-only

At this point, if you still want to mount the root filesystem as read-only, you would need to:

- create a dedicated [Security Context Constraint (SCC)](https://docs.openshift.com/container-platform/3.9/admin_guide/manage_scc.html)
- create a [Service Account](https://docs.openshift.com/container-platform/3.9/dev_guide/service_accounts.html)
- [assign the SCC to the Service Account](https://blog.openshift.com/understanding-service-accounts-sccs/)
- [assign this Service Account to your Deployment](https://blog.openshift.com/understanding-service-accounts-sccs/)

Create a SCC named [`readonly-fs`](read-only-scc.yaml) that mounts the root file system as read-only:

```sh
oc create -f read-only-scc.yaml
```

Create a service account:

```sh
oc create sa readonly
```

Assign the `readonly-fs` SCC to the `readonly` service account:

```sh
oc adm policy add-scc-to-user readonly-fs -z readonly
```

Assign the `readonly` service account to the `rootfs` deployment:

```sh
oc patch dc/rootfs --patch '{"spec":{"template":{"spec":{"serviceAccountName": "readonly"}}}}'
```

Verify that the root file system is mounted read-only:

```sh
$ oc rsh $(oc get pods -l app=rootfs -o name|tail -n 1) mount |head -n 1
overlay on / type overlay (ro,relatime,context="system_u:object_r:svirt_sandbox_file_t:s0:c4,c27",lowerdir=/var/lib/docker/overlay2/l/6HXYZ6ASQAXKMULESF4PBCMOVC:/var/lib/docker/overlay2/l/F6L6WHTZAHKPX722FPFCSPJR7Z:/var/lib/docker/overlay2/l/AZIFQJPO3T2VMKKXOLDVL4Y7RI,upperdir=/var/lib/docker/overlay2/0ceff5b5dae1a00ee14086e6bd0ef5db1600f5f1f2de192255917ceb09ebd31d/diff,workdir=/var/lib/docker/overlay2/0ceff5b5dae1a00ee14086e6bd0ef5db1600f5f1f2de192255917ceb09ebd31d/work)
```

If you re-run the `find / -xdev -writable -ls` command, you should get a different result:

- the files in `/etc/systemd/system/` are still symlinked to `/dev/null`
- but the `/tmp` and `/var/tmp` are not writable anymore

If you try to create a file in `/tmp`, you should get an explicit error message:

```raw
$ touch /tmp/foo
touch: cannot touch '/tmp/foo': Read-only file system
```

But since `/tmp` and `/var/tmp` are required to be writable my most applications,
you would need to mount a writable `tmpfs` filesystem in those locations:

```sh
oc volume dc/rootfs --add --overwrite --name tmp --mount-path /tmp --type emptyDir
oc volume dc/rootfs --add --overwrite --name vartmp --mount-path /var/tmp --type emptyDir
```

If you re-run the `touch /tmp/foo` command, it should now succeed while the
rest of the root file system is still read-only.

## A practical example with a JBoss EAP Application

In this example, we will deploy a very classical JBoss EAP application:
the "openshift-tasks" whose source code can be found [here](https://github.com/nmasse-itix/openshift-tasks).

First, deploy the application as usual, with the `oc new-app` command:

```sh
oc new-app --name=openshift-tasks jboss-eap70-openshift~https://github.com/nmasse-itix/openshift-tasks.git
oc expose service openshift-tasks
```

Assign the `readonly` service account **created before** to the `openshift-tasks` deployment:

```sh
oc patch dc/openshift-tasks --patch '{"spec":{"template":{"spec":{"serviceAccountName": "readonly"}}}}'
```

Override the container entrypoint so that we can work on the configuration
without crashing the container:

```sh
oc patch dc/openshift-tasks --type=json -p '[{"op": "add", "path": "/spec/template/spec/containers/0/command", "value": ["/bin/sh", "-c", "while :; do sleep 1; done" ]}]'
```

Copy the JBoss EAP original configuration and create a Config Map from it:

```sh
mkdir jboss-config
oc rsync $(oc get pods -l app=openshift-tasks -o name|tail -n 1):/opt/eap/standalone/configuration/ jboss-config
oc create configmap jboss-config --from-file=jboss-config
```

Now, mount this config map somewhere and override the JBoss EAP configuration
directory with a `tmpfs` mount:

```sh
oc volume dc/openshift-tasks --add --overwrite --name config-template --mount-path /opt/eap/standalone/configuration.template --type configMap --configmap-name=jboss-config
oc volume dc/openshift-tasks --add --overwrite --name config --mount-path /opt/eap/standalone/configuration/ --type emptyDir
```

Add an init container that will copy the original JBoss configuration to the `tmpfs` mount:

```sh
oc patch dc/openshift-tasks --type=json -p '[ { "op": "add", "path": "/spec/template/spec/initContainers", "value": [] }, { "op": "add", "path": "/spec/template/spec/initContainers/0", "value": { "image": "registry.access.redhat.com/rhel7:7.5", "name": "jboss-config", "command": [ "sh", "-c", "cp -rvL /opt/eap/standalone/configuration.template/* /opt/eap/standalone/configuration/" ], "volumeMounts": [ { "name": "config", "mountPath": "/opt/eap/standalone/configuration/" }, { "name": "config-template", "mountPath": "/opt/eap/standalone/configuration.template" } ] } } ]'
```

**Note:** the `cp -L` switch is required to dereference symlinks created by the Config Map.

Add `tmpfs` mountpoints where required:

```sh
oc volume dc/openshift-tasks --add --overwrite --name tmp --mount-path /tmp --type emptyDir
oc volume dc/openshift-tasks --add --overwrite --name vartmp --mount-path /var/tmp --type emptyDir
oc volume dc/openshift-tasks --add --overwrite --name jboss-logs --mount-path /opt/eap/standalone/log --type emptyDir
oc volume dc/openshift-tasks --add --overwrite --name jboss-data --mount-path /opt/eap/standalone/data --type emptyDir
oc volume dc/openshift-tasks --add --overwrite --name jboss-tmp --mount-path /opt/eap/standalone/tmp --type emptyDir
oc volume dc/openshift-tasks --add --overwrite --name jolokia-config --mount-path /opt/jolokia/etc/ --type emptyDir
```

Now, we need to handle the `deployments` directory that contains the EAR to deploy.
But since JBoss needs to create files in the `deployments` directory, it cannot be
read-only.

Override the default `deployments` directory of JBoss with a `tmpfs` mountpoint:

```sh
oc volume dc/openshift-tasks --add --overwrite --name jboss-deployments --mount-path /opt/eap/standalone/deployments --type emptyDir
```

Add a sidecar container, whose job is to copy the EAR to the new writable `deployments` mountpoint:

```sh
oc patch dc/openshift-tasks --type=json -p '[ { "op": "add", "path": "/spec/template/spec/containers/1", "value": { "image": " ", "name": "jboss-deployments", "command": [ "sh", "-c", "mkfifo /opt/eap/standalone/deployments-rw/deploy && while :; do date; echo deploying...; cp -rvL /opt/eap/standalone/deployments/* /opt/eap/standalone/deployments-rw/; sleep 1; read < /opt/eap/standalone/deployments-rw/deploy; done" ], "volumeMounts": [ { "name": "jboss-deployments", "mountPath": "/opt/eap/standalone/deployments-rw/" } ] } } ]'
```

Add a trigger on image change for this new side-car container:

```sh
oc set triggers dc/openshift-tasks --from-image=openshift-tasks:latest -c jboss-deployments
```

Remove the entrypoint override:

```sh
oc patch dc/openshift-tasks --type=json -p '[{"op": "remove", "path": "/spec/template/spec/containers/0/command" }]'
```

Watch the container start:

```sh
oc get pods -w -l app=openshift-tasks
```

## Why is the root file-system not mounted read-only by default ?

Even if it can be seen as a good practice to mount the root filesystem as read-only,
there also other good reasons not to do so.

Several reasons are tied to the current state of container images, namely those found on
Docker Hub:

- most docker images found on Docker Hub cannot be run with a read-only root file system
- most docker images found on Docker Hub run as root, so a read-only root file system is a
  way to mitigate the fact that root can write anywhere in the container. But since
  OpenShift runs by default all containers on a randomized, non-privileged userid, this
  mitigation is not needed anymore.

There are also other reasons related to maintenance and ease of use:

- If you plan to mount the root file system as read-only, the container cannot be
  handled anymore as a black box. You need to understand the requirements of the
  application and mount writable `tmpfs` at the required locations.
- When the application is shipped with a sample data set (a pre-provisioned SQLite
  database for instance), you will need to define an init container to provision
  this sample data set, which is another component to craft, maintain, support, etc.
- Also, when software editor or when the development team changes the layout of the
  application, with a read-only root file system you would need to re-engineer the
  deployment, whereas with the default OpenShift configuration, the
  software editor or development team would just have to update the Unix permissions
  of the container image and the deployment of the new version could be triggered
  automatically.

Lastly, we can also mention the short-lived containers (deployment containers,
init containers, build containers, etc.) that are created for a one-time task
and destroyed just after. A read-only root file system would not change anything
in this use case.

## Conclusion

As a conclusion, it is definitelly possible to use read-only root filesystems in
OpenShift. For very specific environments where the risks are high, you might consider
this option.

The rationale around the read-only root file system from the [CIS Security Best Practices](https://www.cisecurity.org/benchmark/docker/) is:

- This leads to an immutable infrastructure
- Since the container instance cannot be written to, there is no need to audit instance divergence
- Reduced security attack vectors since the instance cannot be tampered with or written to
- Ability to use a purely volume based backup without backing up anything from the instance

While I definitely agree with the rationale, I also think the read-only root file system
has an impact on the way container are managed and the perceived security gain must be weighted
with the required cost to implement, maintain and support this configuration.

Also, as you can see in this example, the default OpenShift configuration provides
other mechanisms to reach the same goals.

There are improvements in the upstream projects to [secure containers using a read-only root file system](https://blog.openshift.com/add-a-layer-of-security-to-openshift-kubernetes-with-cri-o-in-read-only-mode/).

Some applications can leverage such feature, others were not designed for it and cannot leverage it.
The decision to go for a read-only root file system must be studied and decided on case by case basis.
