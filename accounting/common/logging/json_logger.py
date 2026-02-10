import logging
import os
import socket
from uuid import UUID

from pythonjsonlogger import jsonlogger


class APIJsonLogFormatter(jsonlogger.JsonFormatter):
    def add_fields(self, log_record, record, message_dict):
        super().add_fields(log_record, record, message_dict)
        log_record["app"] = os.environ.get("APP_NAME", "accounting-integration")
        log_record["level"] = record.levelname
        log_record["file_name"] = record.filename
        log_record["func_name"] = record.funcName
        log_record["line_no"] = record.lineno
        log_record["timestamp"] = self.formatTime(record, self.datefmt)
        log_record["message"] = record.getMessage()
        log_record["host_name"] = socket.gethostname()
        log_record["host_ip"] = socket.gethostbyname(socket.gethostname())
        log_record["trace_id"] = getattr(record, "guid", "N/A")
        log_record["method_name"] = getattr(record, "method", "N/A")
        log_record["container_name"] = os.environ.get("APP_NAME", "accounting-integration")
        log_record["env"] = os.environ.get("ENV", "DEV")


def setup_logger(
    logger_name=os.environ.get("APP_LOGGER", "DEFAULT"),
    level=getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO),
):
    class RequestGUIDFilter(logging.Filter):
        def filter(self, record):
            try:
                from flask import g

                record.guid = getattr(g, "request_guid", "N/A")
                record.method = getattr(g, "request_method", "N/A")
            except (RuntimeError, ImportError):
                record.guid = str(UUID(int=0))
            return True

    def create_api_logger():
        j_logger = logging.getLogger(logger_name)
        j_logger.setLevel(level)

        json_handler = logging.StreamHandler()
        json_handler.setFormatter(APIJsonLogFormatter())

        j_logger.setLevel(level)
        j_logger.addFilter(RequestGUIDFilter())
        j_logger.addHandler(json_handler)
        return j_logger

    def create_default_logger():
        d_logger = logging.getLogger(logger_name)
        d_logger.setLevel(level)
        d_logger.propagate = False
        console_formatter = logging.Formatter(
            "%(asctime)-10s | %(levelname)-7s | %(filename)s | %(lineno)d | %(message)-s"
        )
        std_out_handler = logging.StreamHandler()
        std_out_handler.setFormatter(console_formatter)
        d_logger.addHandler(std_out_handler)
        return d_logger

    if logger_name in logging.Logger.manager.loggerDict:
        return logging.getLogger(logger_name)

    match logger_name:
        case "API":
            logger = create_api_logger()
        case _:
            logger = create_default_logger()

    return logger
