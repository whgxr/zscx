package org.jeecg.config;

import javax.servlet.*;
import javax.servlet.annotation.WebFilter;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

@WebFilter(urlPatterns = "/*")
public class CharsetFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletResponse httpResponse = (HttpServletResponse) response;
        String contentType = httpResponse.getContentType();
        if (contentType != null && contentType.contains("application/json") && !contentType.contains("charset")) {
            httpResponse.setContentType(contentType + ";charset=UTF-8");
        }
        chain.doFilter(request, response);
    }
}