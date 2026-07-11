package org.jeecg.filter;

import javax.servlet.*;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;

public class Utf8CharacterEncodingFilter implements Filter {

    @Override
    public void init(FilterConfig filterConfig) throws ServletException {}

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        httpRequest.setCharacterEncoding(StandardCharsets.UTF_8.name());
        httpResponse.setCharacterEncoding(StandardCharsets.UTF_8.name());
        
        String contentType = httpResponse.getContentType();
        if (contentType != null && !contentType.contains("charset")) {
            httpResponse.setContentType(contentType + ";charset=UTF-8");
        } else if (contentType == null) {
            httpResponse.setContentType("text/html;charset=UTF-8");
        }
        
        chain.doFilter(request, response);
    }

    @Override
    public void destroy() {}
}