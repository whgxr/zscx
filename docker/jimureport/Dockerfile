# 第一阶段：构建 JimuReport
FROM maven:3.9-eclipse-temurin-17 AS builder
WORKDIR /build
RUN git clone --depth 1 --branch master https://gitee.com/jeecg/JimuReport.git .

# Add custom config for UTF-8 JSON encoding
RUN mkdir -p /build/jimureport-example/src/main/java/org/jeecg/config
COPY WebMvcConfig.java /build/jimureport-example/src/main/java/org/jeecg/config/WebMvcConfig.java
RUN mkdir -p /build/jimureport-example/src/main/java/org/jeecg/filter
COPY Utf8CharacterEncodingFilter.java /build/jimureport-example/src/main/java/org/jeecg/filter/Utf8CharacterEncodingFilter.java

WORKDIR /build/jimureport-example
RUN mvn clean package -DskipTests -q

# 第二阶段：运行环境
FROM eclipse-temurin:17-jre-alpine
RUN ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime
RUN mkdir -p /jimureport
WORKDIR /jimureport
EXPOSE 8085
COPY --from=builder /build/jimureport-example/target/jimureport-example-*.jar ./app.jar
ENV LANG=en_US.UTF-8
ENV LANGUAGE=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8
ENV TZ=Asia/Shanghai
ENTRYPOINT ["sh", "-c", "java -DMYSQL-HOST=${MYSQL_HOST:-mysql} -DMYSQL-PORT=${MYSQL_PORT:-3306} -DMYSQL-DB=${MYSQL_DB:-jimureport} -DMYSQL-USERNAME=${MYSQL_USER:-root} -DMYSQL-PASSWORD=${MYSQL_PASSWORD:-root123456} -Dfile.encoding=utf-8 -Dsun.jnu.encoding=utf-8 -Dclient.encoding.override=utf-8 -Ddefault.client.encoding=utf-8 -Djava.security.egd=file:/dev/./urandom -jar app.jar"]