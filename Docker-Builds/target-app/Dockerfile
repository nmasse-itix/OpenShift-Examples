# When we built locally the "custom-tomcat" image we tagged it "custom-tomcat:dev"
# So we make sure to re-use it there so that we can test this Dockerfile
# locally before creating the OpenShift configuration.
# Do not forget that when a Docker build is triggered in OpenShift, the "FROM"
# line is rewritten with the correct imagestreamtag. 
FROM custom-tomcat:dev

# The artifact URL will be given at build time
ARG ARTIFACT_URL

# Download the artifact and install it
RUN curl -Lo /opt/tomcat/webapps/my-sample-app.war ${ARTIFACT_URL}
