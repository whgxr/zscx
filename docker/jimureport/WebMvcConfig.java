package org.jeecg.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.MediaType;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void configureMessageConverters(List<HttpMessageConverter<?>> converters) {
        MappingJackson2HttpMessageConverter jacksonConverter = new MappingJackson2HttpMessageConverter();
        
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        jacksonConverter.setObjectMapper(objectMapper);
        jacksonConverter.setDefaultCharset(StandardCharsets.UTF_8);
        jacksonConverter.setSupportedMediaTypes(Arrays.asList(
            MediaType.APPLICATION_JSON,
            new MediaType("application", "json", StandardCharsets.UTF_8),
            MediaType.APPLICATION_JSON_UTF8
        ));
        
        converters.clear();
        converters.add(jacksonConverter);
    }
}