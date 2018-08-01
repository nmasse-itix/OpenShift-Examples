# When we built locally the "custom-base" image we tagged it "custom-base:dev"
# So we make sure to re-use it there so that we can test this Dockerfile
# locally before creating the OpenShift configuration.
# Do not forget that when a Docker build is triggered in OpenShift, the "FROM"
# line is rewritten with the correct imagestreamtag. 
FROM custom-base:dev

# The tomcat archive URL will be given at build time
ARG TOMCAT_URL

# Update the system, install OpenJDK and cleanup the yum metadata
RUN yum -y update \
 && yum -y install java-1.8.0-openjdk-headless \
 && yum clean all \
 && rm -rf /var/cache/yum

# Download tomcat and install it
RUN mkdir /opt/tomcat \
 && curl -Lo /tmp/tomcat.tgz ${TOMCAT_URL} \
 && tar -xv --strip-components=1 -C /opt/tomcat -f /tmp/tomcat.tgz \
 && rm -f /tmp/tomcat.tgz \
 # Make sure all files are owned by root so that they cannot be modified at runtime
 && chown root:root -R /opt/tomcat \
 # And at least readable by anyone
 && chmod -R ugo+r,+X /opt/tomcat \
 # But give write permissions on the webapps folders since tomcat will unpack
 # the war files in this location at runtime
 && chmod -R ugo+rw,+X /opt/tomcat/webapps

# Those folders are used by tomcat to store ephemeral files
VOLUME [ "/opt/tomcat/work", "/opt/tomcat/temp", "/opt/tomcat/logs" ]

# By default, tomcat listens on port 8080
EXPOSE 8080

# Move to this directory before running the catalina.sh command
WORKDIR /opt/tomcat

# The container will always run catalina.sh
ENTRYPOINT [ "/opt/tomcat/bin/catalina.sh" ]

# But you can still override the command (run -security, start, etc.)
CMD [ "run" ]
